"""Hedera testnet access: EVM calls through the JSON-RPC relay, history through the public mirror node."""

import time

import requests
from eth_account import Account
from web3 import Web3
from web3.exceptions import TimeExhausted
from web3.providers.rpc.utils import ExceptionRetryConfiguration

from .config import optional, required

MIRROR = "https://testnet.mirrornode.hedera.com/api/v1"


HEDERA_TESTNET_CHAIN_ID = 296
FALLBACK_RPC_URLS = ["https://296.rpc.thirdweb.com"]
NETWORK_ERRORS = (requests.HTTPError, requests.ConnectionError, requests.Timeout)
RETRY = ExceptionRetryConfiguration(errors=NETWORK_ERRORS, retries=6, backoff_factor=0.5)


def web3() -> Web3:
    """Connects to the first Hedera testnet JSON-RPC endpoint that answers (public relays have outages)."""
    urls = [required("HEDERA_RPC_URL"), *(optional("HEDERA_RPC_FALLBACK_URLS") or "").split(","), *FALLBACK_RPC_URLS]
    for url in dict.fromkeys(u.strip() for u in urls if u.strip()):
        w3 = Web3(Web3.HTTPProvider(url, request_kwargs={"timeout": 60}, exception_retry_configuration=RETRY))
        try:
            if w3.eth.chain_id == HEDERA_TESTNET_CHAIN_ID:
                return w3
        except Exception:
            continue
    raise RuntimeError("No Hedera testnet JSON-RPC endpoint is reachable right now")


def operator():
    """The operator's EVM account. msg.sender for its transactions is the key's EVM address."""
    return Account.from_key(required("HEDERA_OPERATOR_KEY"))


def long_zero_address(entity_id: str) -> str:
    """0.0.N -> 0x000...N (how Hedera addresses tokens and accounts without an EVM alias)."""
    shard, realm, num = (int(part) for part in entity_id.split("."))
    return Web3.to_checksum_address(f"0x{shard:08x}{realm:016x}{num:016x}")


def evm_address_of(account_id: str) -> str:
    """The address an account uses on the EVM: its alias if it has one, else its long-zero address."""
    body = _mirror(f"/accounts/{account_id}")
    return Web3.to_checksum_address(body["evm_address"]) if body.get("evm_address") else long_zero_address(account_id)


def contract_id_of(evm_address: str, attempts: int = 10) -> str:
    """Looks up a contract's Hedera ID (0.0.N). The mirror node lags consensus by a few seconds."""
    for _ in range(attempts):
        response = requests.get(f"{MIRROR}/contracts/{evm_address}", timeout=20)
        if response.ok:
            return response.json()["contract_id"]
        time.sleep(3)
    raise RuntimeError(f"Mirror node has no contract at {evm_address} yet")


def token_balance(entity_id: str, token_id: str) -> int:
    body = _mirror(f"/accounts/{entity_id}/tokens?token.id={token_id}")
    tokens = body.get("tokens") or []
    return int(tokens[0]["balance"]) if tokens else 0


def send(w3: Web3, account, tx: dict) -> dict:
    """Signs and sends a legacy-priced transaction, waits for its receipt, and fails loudly if it reverted.

    Several services send from the operator account. If another one takes the nonce first, the
    transaction is signed again with the next nonce instead of waiting for a receipt that never comes.
    """
    tx = {key: value for key, value in tx.items() if key not in ("maxFeePerGas", "maxPriorityFeePerGas", "type", "nonce")}
    tx.update({"from": account.address, "gasPrice": w3.eth.gas_price, "chainId": w3.eth.chain_id})
    for _ in range(4):
        signed = account.sign_transaction({**tx, "nonce": w3.eth.get_transaction_count(account.address, "pending")})
        if _broadcast(w3, signed):
            return _receipt(w3, signed.hash)
        # The nonce was taken: by this same transaction on an earlier attempt, or by another sender.
        try:
            return _receipt(w3, signed.hash, timeout=15)
        except RuntimeError as error:
            if "reverted" in str(error):
                raise
    raise RuntimeError("Couldn't get a nonce for the transaction: other senders kept taking it")


def _broadcast(w3: Web3, signed) -> bool:
    """Sends a signed transaction. False if its nonce was already used; True once the node has it."""
    for attempt in range(6):
        # Re-sending the same signed transaction is safe: it has one hash and can only be included once.
        try:
            w3.eth.send_raw_transaction(signed.raw_transaction)
            return True
        except NETWORK_ERRORS:
            time.sleep(2 + attempt * 2)
        except ValueError as error:
            message = str(error).lower()
            if "known" in message:
                return True
            if "nonce too low" in message:
                return False
            raise
    return True


def _receipt(w3: Web3, tx_hash, timeout: int = 180) -> dict:
    receipt = None
    for _ in range(6 if timeout >= 60 else 1):
        try:
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=timeout)
            break
        except NETWORK_ERRORS:
            time.sleep(3)
        except TimeExhausted:
            break
    if receipt is None:
        raise RuntimeError(f"No receipt for {hashscan_tx(tx_hash.to_0x_hex())}")
    if receipt["status"] != 1:
        raise RuntimeError(f"Transaction reverted: {hashscan_tx(tx_hash.to_0x_hex())}")
    return receipt


def hashscan_tx(tx_hash_or_id: str) -> str:
    return f"https://hashscan.io/testnet/transaction/{tx_hash_or_id}"


def hashscan_contract(contract_id: str) -> str:
    return f"https://hashscan.io/testnet/contract/{contract_id}"


def format_usdc(atomic: int) -> str:
    return f"{atomic / 1_000_000:.6f} USDC"


def _mirror(path: str) -> dict:
    response = requests.get(f"{MIRROR}{path}", timeout=20)
    response.raise_for_status()
    return response.json()

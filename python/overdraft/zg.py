"""0G mainnet access: the PaymentVault (compute accounts) and the Router (inference).

Deposited credit in the PaymentVault has no user withdrawal path, so a loan deposited with
depositFor(agent) can only be spent on inference.
"""

import os
import time

import requests
from eth_account import Account
from web3 import Web3

from .config import optional, required

RPC_URL = optional("ZG_RPC_URL") or "https://evmrpc.0g.ai"
ROUTER_URL = (optional("ZG_ROUTER_URL") or "https://router-api.0g.ai/v1").rstrip("/")
CHAIN_ID = 16661
PAYMENT_VAULT = Web3.to_checksum_address("0xA3b15Bd2aD18BFB6b5f92D8AA9F444Dd59d1cE32")
EXPLORER = "https://chainscan.0g.ai"
WEI = 10**18
ROUTER_MIN_COST_0G = 0.01  # the Router admits a request only if the account can cover at least this much

VAULT_ABI = [
    {"name": "depositFor", "type": "function", "stateMutability": "payable",
     "inputs": [{"name": "user", "type": "address"}], "outputs": []},
    {"name": "balanceOf", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "user", "type": "address"}], "outputs": [{"name": "", "type": "uint256"}]},
]


def price_usd() -> float:
    """The 0G/USD price snapshot used to convert loans (recorded in every log line that uses it)."""
    return float(optional("ZG_PRICE_USD") or "0.157")


def usd_to_wei(usd: float) -> int:
    return int(usd / price_usd() * WEI)


def wei_to_usd(wei: int) -> float:
    return wei / WEI * price_usd()


def web3() -> Web3:
    w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 60}))
    if w3.eth.chain_id != CHAIN_ID:
        raise RuntimeError(f"{RPC_URL} is not 0G mainnet")
    return w3


def vault(w3: Web3):
    return w3.eth.contract(address=PAYMENT_VAULT, abi=VAULT_ABI)


def vault_balance_wei(address: str) -> int:
    w3 = web3()
    return vault(w3).functions.balanceOf(Web3.to_checksum_address(address)).call()


def tx_url(tx_hash: str) -> str:
    return f"{EXPLORER}/tx/{tx_hash}"


def simulate_deposit(to: str, amount_wei: int) -> dict:
    """Simulates depositFor(to) against the live PaymentVault without spending anything."""
    sender = Web3.to_checksum_address("0x" + os.urandom(20).hex())
    to = Web3.to_checksum_address(to)
    selector = lambda sig: Web3.keccak(text=sig)[:4].hex()
    arg = to[2:].lower().rjust(64, "0")
    balance_of = {"from": sender, "to": PAYMENT_VAULT, "data": "0x" + selector("balanceOf(address)") + arg}
    deposit = {"from": sender, "to": PAYMENT_VAULT, "data": "0x" + selector("depositFor(address)") + arg, "value": hex(amount_wei)}
    body = requests.post(RPC_URL, timeout=60, json={
        "jsonrpc": "2.0", "id": 1, "method": "eth_simulateV1",
        "params": [{"blockStateCalls": [{"stateOverrides": {sender: {"balance": hex(amount_wei * 10)}},
                                         "calls": [balance_of, deposit, balance_of]}], "validation": False}, "latest"],
    }).json()
    if "error" in body:
        raise RuntimeError(f"eth_simulateV1: {body['error']}")
    before, dep, after = body["result"][0]["calls"]
    return {
        "ok": dep["status"] == "0x1" and int(after["returnData"], 16) - int(before["returnData"], 16) == amount_wei,
        "before_wei": int(before["returnData"], 16),
        "after_wei": int(after["returnData"], 16),
    }


def deposit_for(to: str, amount_wei: int) -> str:
    """Deposits amount_wei of 0G into `to`'s compute account from the lender wallet. Returns the tx hash."""
    w3 = web3()
    lender = Account.from_key(required("ZG_DEPOSITOR_KEY"))
    tx = vault(w3).functions.depositFor(Web3.to_checksum_address(to)).build_transaction(
        {"from": lender.address, "value": amount_wei, "gas": 150_000}
    )
    tx = {k: v for k, v in tx.items() if k not in ("maxFeePerGas", "maxPriorityFeePerGas", "type")}
    tx.update({"nonce": w3.eth.get_transaction_count(lender.address), "gasPrice": w3.eth.gas_price, "chainId": CHAIN_ID})
    signed = lender.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
    if receipt["status"] != 1:
        raise RuntimeError(f"depositFor reverted: {tx_url(tx_hash.to_0x_hex())}")
    return tx_hash.to_0x_hex()


class InsufficientBudget(Exception):
    """The account can't pay for the request right now."""


def router_balance_wei(management_key: str) -> int:
    """Total spendable balance of the account the read-only management key belongs to (Router ledger + vault)."""
    response = requests.get(f"{ROUTER_URL}/account/balance", headers={"Authorization": f"Bearer {management_key}"}, timeout=30)
    response.raise_for_status()
    body = response.json()
    if body.get("currency", "0g") != "0g":
        raise RuntimeError("The agent's 0G account settles in USD; switch it to 0G at pc.0g.ai, or loans can't be spent")
    return int(body.get("total_balance") or body.get("balance") or 0)


def chat(api_key: str, model: str, messages: list[dict], max_tokens: int = 300) -> dict:
    """One inference call. Returns {text, request_id, cost_usd, model, provider}."""
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    trust_mode = optional("ZG_TRUST_MODE")
    if trust_mode:
        headers["X-0G-Provider-Trust-Mode"] = trust_mode
    started = time.monotonic()
    response = requests.post(f"{ROUTER_URL}/chat/completions", headers=headers, timeout=120,
                             json={"model": model, "messages": messages, "max_tokens": max_tokens})
    if response.status_code == 402 or "insufficient" in response.text.lower():
        raise InsufficientBudget(response.text[:200])
    response.raise_for_status()
    body = response.json()
    trace = body.get("x_0g_trace") or {}
    billing = trace.get("billing") or {}
    return {
        "text": body["choices"][0]["message"]["content"],
        "request_id": trace.get("request_id"),
        "cost_usd": int(billing.get("total_cost_usd_micro") or 0) / 1_000_000,
        "model": body.get("model", model),
        "provider": trace.get("provider"),
        "tee_verified": trace.get("tee_verified"),
        "seconds": round(time.monotonic() - started, 2),
    }

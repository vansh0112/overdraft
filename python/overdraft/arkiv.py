"""A small Arkiv client over its documented JSON-RPC API (docs.arkiv.network/json-rpc/).

Writes are Ethereum transactions to the Arkiv address calling execute((uint8,bytes)[]).
Reads use the arkiv_query / arkiv_getEntity / arkiv_getBlockTiming methods.
We use the API directly because Arkiv's Python SDK predates the Rabdi testnet.
"""

import os
from dataclasses import dataclass

import requests
from eth_abi import encode
from eth_account import Account
from web3 import Web3

from .config import optional, required

ARKIV_ADDRESS = Web3.to_checksum_address("0x4400000000000000000000000000000000000044")
EXECUTE_ABI = [
    {
        "name": "execute",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {
                "name": "ops",
                "type": "tuple[]",
                "components": [{"name": "operation", "type": "uint8"}, {"name": "operationData", "type": "bytes"}],
            }
        ],
        "outputs": [],
    }
]
ENTITY_CREATED_TOPIC = Web3.keccak(text="EntityCreated(bytes32,address,uint64,uint8)").to_0x_hex()

OP_CREATE = 1
INDEXED = 0x80
TYPE_U64, TYPE_BYTES, TYPE_STR, TYPE_ADDR = 3, 7, 8, 9
BLOCKS_PER_DAY = 43_200  # 2-second blocks
MAX_LIFETIME_BLOCKS = 7_884_000


@dataclass(frozen=True)
class Attr:
    """One attribute. kind is 'str', 'u64', 'addr' or 'bytes'. Only indexed attributes can be filtered on."""

    name: str
    kind: str
    value: object
    indexed: bool = True

    def encoded(self) -> tuple[bytes, int, bytes]:
        name = self.name.encode("ascii")
        if not 0 < len(name) <= 32:
            raise ValueError(f"Attribute name must be 1-32 bytes: {self.name!r}")
        if self.kind == "str":
            type_id, value = TYPE_STR, str(self.value).encode("utf-8")
            if len(value) > 128:
                raise ValueError(f"str attribute {self.name} is over 128 bytes")
        elif self.kind == "u64":
            type_id, value = TYPE_U64, int(self.value).to_bytes(32, "big")
        elif self.kind == "addr":
            type_id, value = TYPE_ADDR, bytes(12) + bytes.fromhex(str(self.value).removeprefix("0x"))
        elif self.kind == "bytes":
            if self.indexed:
                raise ValueError("bytes attributes can't be indexed")
            type_id, value = TYPE_BYTES, bytes(self.value)
        else:
            raise ValueError(f"Unsupported attribute kind: {self.kind}")
        return name.ljust(32, b"\0"), type_id | (INDEXED if self.indexed else 0), value


def rpc_url() -> str:
    url = required("ARKIV_RPC_URL").rstrip("/")
    key = optional("ARKIV_ACCESS_KEY")
    return f"{url}/{key}" if key else url


def web3() -> Web3:
    return Web3(Web3.HTTPProvider(rpc_url(), request_kwargs={"timeout": 60}))


def bureau():
    return Account.from_key(required("ARKIV_BUREAU_KEY"))


def create_entity(attrs: list[Attr], lifetime_blocks: int, *, salt: int | None = None) -> dict:
    """Creates one entity owned by the bureau wallet. Returns {key, expiresAt, txHash}."""
    if not 0 < lifetime_blocks <= MAX_LIFETIME_BLOCKS:
        raise ValueError("Lifetime must be between 1 block and 7,884,000 blocks (about 182.5 days)")
    encoded = sorted((a.encoded() for a in attrs), key=lambda item: item[0])  # strictly ascending by name
    names = [item[0] for item in encoded]
    if len(set(names)) != len(names):
        raise ValueError("Duplicate attribute names")
    if len(encoded) > 32:
        raise ValueError("At most 32 attributes per entity")

    salt = salt if salt is not None else int.from_bytes(os.urandom(16), "big")
    operation_data = encode(
        ["(uint128,uint64,uint64,uint8,(bytes32,uint8,bytes)[])"],
        [(salt, 0, lifetime_blocks, 0, encoded)],
    )

    w3, account = web3(), bureau()
    contract = w3.eth.contract(address=ARKIV_ADDRESS, abi=EXECUTE_ABI)
    tx = contract.functions.execute([(OP_CREATE, operation_data)]).build_transaction(
        {"from": account.address, "value": 0}
    )
    tx = {k: v for k, v in tx.items() if k not in ("maxFeePerGas", "maxPriorityFeePerGas", "type")}
    tx.update(
        {
            "nonce": w3.eth.get_transaction_count(account.address),
            "gasPrice": w3.eth.gas_price,
            "chainId": w3.eth.chain_id,
        }
    )
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if receipt["status"] != 1:
        raise RuntimeError(f"Arkiv create reverted: {tx_hash.to_0x_hex()}")

    for log in receipt["logs"]:
        if log["address"].lower() == ARKIV_ADDRESS.lower() and log["topics"][0].to_0x_hex() == ENTITY_CREATED_TOPIC:
            expires_at = int.from_bytes(log["data"][:32], "big")
            return {"key": log["topics"][1].to_0x_hex(), "expiresAt": expires_at, "txHash": tx_hash.to_0x_hex()}
    raise RuntimeError(f"No EntityCreated event in {tx_hash.to_0x_hex()}")


def query(condition: str, *, select: dict | None = None, limit: int = 100, offset: int = 0) -> dict:
    params = {"select": select or {"key": True, "attributes": True}, "limit": hex(limit)}
    if offset:
        params["offset"] = hex(offset)
    return _rpc("arkiv_query", [condition, params])


def get_entity(key: str) -> dict | None:
    return _rpc("arkiv_getEntity", [key])


def block_timing() -> dict:
    return _rpc("arkiv_getBlockTiming", [])


def balance(address: str) -> int:
    return web3().eth.get_balance(address)


def _rpc(method: str, params: list):
    response = requests.post(rpc_url(), json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=60)
    response.raise_for_status()
    body = response.json()
    if "error" in body:
        raise RuntimeError(f"{method} failed: {body['error']}")
    return body["result"]

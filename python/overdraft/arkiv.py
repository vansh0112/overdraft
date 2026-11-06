"""A small Arkiv client over its documented JSON-RPC API (docs.arkiv.network/json-rpc/).

Writes are Ethereum transactions to the Arkiv address calling execute((uint8,bytes)[]).
Reads use the arkiv_query / arkiv_getEntity / arkiv_getBlockTiming methods.
We use the API directly because Arkiv's Python SDK predates the Rabdi testnet.
"""

import os
import time
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
MAX_PAGE = 100  # the most entities a node returns per query
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
    return required("ARKIV_RPC_URL").rstrip("/")


def _headers() -> dict:
    """The access key travels in a header, never in the URL, so it can't show up in logs or error messages."""
    key = optional("ARKIV_ACCESS_KEY")
    return {"X-API-KEY": key} if key else {}


def web3() -> Web3:
    # Headers given here replace the provider's own, so keep its JSON content type and add the key.
    headers = {**Web3.HTTPProvider(rpc_url()).get_request_headers(), **_headers()}
    return Web3(Web3.HTTPProvider(rpc_url(), request_kwargs={"timeout": 60, "headers": headers}))


def bureau():
    return Account.from_key(required("ARKIV_BUREAU_KEY"))


def create_entities(items: list[tuple[list[Attr], int]]) -> dict:
    """Creates several entities owned by the bureau wallet in one transaction (all or none).

    items: (attributes, lifetime in blocks) per entity. Returns {"txHash", "entities": [{key, expiresAt}]}.
    """
    if not items:
        raise ValueError("Nothing to create")
    ops = []
    for attrs, lifetime_blocks in items:
        if not 0 < lifetime_blocks <= MAX_LIFETIME_BLOCKS:
            raise ValueError("Lifetime must be between 1 block and 7,884,000 blocks (about 182.5 days)")
        encoded = sorted((a.encoded() for a in attrs), key=lambda item: item[0])  # strictly ascending by name
        names = [item[0] for item in encoded]
        if len(set(names)) != len(names):
            raise ValueError("Duplicate attribute names")
        if len(encoded) > 32:
            raise ValueError("At most 32 attributes per entity")
        salt = int.from_bytes(os.urandom(16), "big")
        ops.append((OP_CREATE, encode(["(uint128,uint64,uint64,uint8,(bytes32,uint8,bytes)[])"], [(salt, 0, lifetime_blocks, 0, encoded)])))

    w3, account = web3(), bureau()
    contract = w3.eth.contract(address=ARKIV_ADDRESS, abi=EXECUTE_ABI)
    tx = contract.functions.execute(ops).build_transaction({"from": account.address, "value": 0})
    tx = {k: v for k, v in tx.items() if k not in ("maxFeePerGas", "maxPriorityFeePerGas", "type", "nonce")}
    tx.update({"gasPrice": w3.eth.gas_price, "chainId": w3.eth.chain_id})
    # Several services write as the bureau wallet (the bureau writer, the relay, the console API). If another
    # one takes the nonce first, sign again with the next one.
    for attempt in range(4):
        signed = account.sign_transaction({**tx, "nonce": w3.eth.get_transaction_count(account.address, "pending")})
        try:
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
            break
        except ValueError as error:
            message = str(error).lower()
            if attempt == 3 or not any(word in message for word in ("nonce", "replacement", "already known")):
                raise
            time.sleep(1 + attempt)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if receipt["status"] != 1:
        raise RuntimeError(f"Arkiv batch reverted: {tx_hash.to_0x_hex()}")

    entities = [
        {"key": log["topics"][1].to_0x_hex(), "expiresAt": int.from_bytes(log["data"][:32], "big")}
        for log in receipt["logs"]
        if log["address"].lower() == ARKIV_ADDRESS.lower() and log["topics"][0].to_0x_hex() == ENTITY_CREATED_TOPIC
    ]
    if len(entities) != len(items):
        raise RuntimeError(f"Expected {len(items)} EntityCreated events in {tx_hash.to_0x_hex()}, got {len(entities)}")
    return {"txHash": tx_hash.to_0x_hex(), "entities": entities}


def create_entity(attrs: list[Attr], lifetime_blocks: int) -> dict:
    """Creates one entity owned by the bureau wallet. Returns {key, expiresAt, txHash}."""
    result = create_entities([(attrs, lifetime_blocks)])
    return {**result["entities"][0], "txHash": result["txHash"]}


def query(condition: str, *, select: dict | None = None, limit: int = 100, offset: int = 0) -> dict:
    params = {"select": select or {"key": True, "attributes": True}, "limit": hex(limit)}
    if offset:
        params["offset"] = hex(offset)
    return _rpc("arkiv_query", [condition, params])


def query_all(condition: str, *, select: dict | None = None, max_pages: int = 20) -> list[dict]:
    """Every entity matching the condition, following the node's cursor 100 at a time."""
    params = {"select": select or {"key": True, "attributes": True}, "limit": hex(MAX_PAGE)}
    entities: list[dict] = []
    for _ in range(max_pages):
        page = _rpc("arkiv_query", [condition, params])
        entities.extend(page["data"])
        if len(page["data"]) < MAX_PAGE or not page.get("cursor"):
            break
        params = {**params, "cursor": page["cursor"]}
    return entities


def get_entity(key: str) -> dict | None:
    return _rpc("arkiv_getEntity", [key])


def block_timing() -> dict:
    return _rpc("arkiv_getBlockTiming", [])


def balance(address: str) -> int:
    return web3().eth.get_balance(address)


def _rpc(method: str, params: list):
    for attempt in range(5):
        response = requests.post(rpc_url(), json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, headers=_headers(),
                                 timeout=60)
        if response.status_code not in (429, 502, 503, 504):
            break
        time.sleep(1.5 * (attempt + 1))  # rate limited or briefly unavailable: back off and retry
    response.raise_for_status()
    body = response.json()
    if "error" in body:
        raise RuntimeError(f"{method} failed: {body['error']}")
    return body["result"]

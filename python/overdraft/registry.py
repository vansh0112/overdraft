"""Every agent with a credit line, read from the CreditLine's events on Hedera's public mirror node.

The chain is the registry. Enrolling an agent sets its line, with no credit until the underwriter
approves it, and the line names the agent's splitter. Services read lines and splitters from here, so
a newly enrolled agent is swept, funded, recorded and watched without any configuration.
"""

import threading
from dataclasses import dataclass

import requests
from hexbytes import HexBytes
from web3 import Web3

from .config import read_deployments
from .hedera import MIRROR, contract_id_of
from .solidity import load_abi


def new_logs(contract_id: str, cursor: dict | None) -> list[dict]:
    """Logs emitted by a contract after the cursor, oldest first, from the mirror node."""
    params = f"order=asc&limit=100&timestamp=gte:{cursor['timestamp']}" if cursor else "order=asc&limit=100"
    url = f"{MIRROR}/contracts/{contract_id}/results/logs?{params}"
    logs = []
    while url:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        body = response.json()
        logs.extend(body.get("logs", []))
        nxt = (body.get("links") or {}).get("next")
        url = f"{MIRROR.rsplit('/api/v1', 1)[0]}{nxt}" if nxt else None
    if cursor:
        logs = [l for l in logs if (l["timestamp"], l["index"]) > (cursor["timestamp"], cursor["index"])]
    return logs


def decode(contract, log: dict):
    """Returns (event name, args) for a mirror-node log, or None if it isn't one of the contract's events."""
    entry = {
        "address": Web3.to_checksum_address(log["address"]),
        "topics": [HexBytes(t) for t in log["topics"]],
        "data": HexBytes(log["data"]),
        "blockNumber": log["block_number"],
        "transactionHash": HexBytes(log["transaction_hash"]),
        "transactionIndex": log.get("transaction_index") or 0,
        "blockHash": HexBytes(log["block_hash"][:66]),
        "logIndex": log["index"],
    }
    for event in contract.events:
        try:
            decoded = event().process_log(entry)
            return decoded["event"], decoded["args"]
        except Exception:
            continue
    return None


@dataclass(frozen=True)
class Line:
    """An agent's line as last set by the underwriter (its LimitSet event)."""

    agent_id: int
    agent: str
    owner: str
    splitter: str
    splitter_id: str
    zg_account: str
    limit: int


_lock = threading.Lock()
_cursor: dict | None = None
_lines: dict[int, Line] = {}
_contract_ids: dict[str, str] = {}


def _contract_id(evm_address: str) -> str:
    key = evm_address.lower()
    if key not in _contract_ids:
        _contract_ids[key] = contract_id_of(evm_address)  # a contract's ID never changes
    return _contract_ids[key]


def lines() -> list[Line]:
    """Every agent's line, in agent ID order. Only events newer than the last call are fetched."""
    global _cursor
    with _lock:
        contract = Web3().eth.contract(abi=load_abi("CreditLine"))
        for log in new_logs(read_deployments()["creditLineContractId"], _cursor):
            decoded = decode(contract, log)
            if decoded and decoded[0] == "LimitSet":
                a = decoded[1]
                _lines[a["agentId"]] = Line(a["agentId"], a["agent"], a["owner"], a["splitter"], _contract_id(a["splitter"]),
                                            a["zgAccount"], a["limit"])
            _cursor = {"timestamp": log["timestamp"], "index": log["index"]}
        return [_lines[agent_id] for agent_id in sorted(_lines)]


def splitter_ids() -> list[str]:
    """Contract IDs of every agent's splitter: each line's, plus any named in the deployments file."""
    deployments = read_deployments()
    ids = [line.splitter_id for line in lines()]
    if deployments.get("splitterContractId"):
        ids.append(deployments["splitterContractId"])
    ids += [entry["contractId"] for entry in deployments.get("splitters", {}).values()]
    return list(dict.fromkeys(ids))

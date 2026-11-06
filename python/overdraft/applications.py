"""Enrolment applications on Arkiv: what each owner signed to enrol their agent.

One record per enrolment, written by the bureau wallet. It holds the owner's signed application, so
anyone can check the owner asked for it, and the splitter created for the agent. Its hash is the
decision hash of the line opened at enrolment. The watcher reads agents' paid endpoints from here.
"""

import json
import threading
import time

from web3 import Web3

from . import arkiv
from .arkiv import Attr
from .bureau import SCHEMA, bureau_address

KIND = "application"
LIFETIME_BLOCKS = 180 * arkiv.BLOCKS_PER_DAY  # Arkiv keeps a record for at most about 182 days
CACHE_SECONDS = 60


def canonical(record: dict) -> bytes:
    return json.dumps(record, sort_keys=True, separators=(",", ":")).encode()


def fingerprint(record: dict) -> str:
    return Web3.keccak(canonical(record)).to_0x_hex()


def publish(record: dict) -> dict:
    attrs = [
        Attr("arkiv.schema", "str", SCHEMA),
        Attr("kind", "str", KIND),
        Attr("agentId", "u64", record["agentId"]),
        Attr("owner", "addr", record["owner"]),
        Attr("decisionHash", "str", fingerprint(record)),
        Attr("record", "bytes", canonical(record), indexed=False),
    ]
    entity = arkiv.create_entity(attrs, LIFETIME_BLOCKS)
    with _lock:  # known at once, without waiting for the node to index it or to answer a query
        _cache["records"][record["agentId"]] = {"record": record, "key": entity["key"], "fingerprint": fingerprint(record)}
    return entity


_lock = threading.Lock()
_query_lock = threading.Lock()  # one query at a time: callers arriving together share its answer
_cache: dict = {"at": 0.0, "records": {}}


def latest() -> dict[int, dict]:
    """Every agent's most recent application, by agent ID: {"record", "key", "fingerprint"}.

    If the Arkiv node is busy, the last applications read (and any published since) are returned instead.
    """
    with _lock:
        if time.monotonic() - _cache["at"] < CACHE_SECONDS:
            return dict(_cache["records"])
    with _query_lock:
        with _lock:
            if time.monotonic() - _cache["at"] < CACHE_SECONDS:  # another caller just read them
                return dict(_cache["records"])
        return _query()


def _query() -> dict[int, dict]:
    condition = f"arkiv.schema = str('{SCHEMA}') AND $owner = addr({bureau_address()}) AND kind = str('{KIND}')"
    try:
        entities = arkiv.query_all(condition, select={"key": True, "attributes": True})
    except Exception:
        with _lock:
            if _cache["records"]:
                return dict(_cache["records"])
        raise
    records: dict[int, dict] = {}
    for entity in entities:
        attrs = {a["name"]: a["value"] for a in entity["attributes"]}
        raw = bytes.fromhex(attrs["record"].removeprefix("0x"))
        if Web3.keccak(raw).to_0x_hex() != attrs.get("decisionHash"):
            continue  # not intact: never act on it
        record = json.loads(raw)
        current = records.get(record["agentId"])
        if current is None or record["issuedAt"] > current["record"]["issuedAt"]:
            records[record["agentId"]] = {"record": record, "key": entity["key"], "fingerprint": attrs["decisionHash"]}
    with _lock:
        for agent_id, found in _cache["records"].items():  # published here but not indexed by the node yet
            if agent_id not in records or found["record"]["issuedAt"] > records[agent_id]["record"]["issuedAt"]:
                records[agent_id] = found
        _cache.update(at=time.monotonic(), records=records)
    return dict(records)

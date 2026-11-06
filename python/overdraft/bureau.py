"""Credit bureau: records Overdraft's credit history on Arkiv.

The bureau reads the CreditLine and IncomeSplitter events from Hedera's public mirror node and writes
one Arkiv entity per fact, owned by the bureau wallet so readers can trust who wrote it. Each record
expires on its own (Arkiv deletes it at the end of its lifetime), so old history ages out like a credit
report.

    python -m overdraft.bureau watch [--interval 10] [--once]
    python -m overdraft.bureau report AGENT_ID
"""

import argparse
import json
import time

from web3 import Web3

from . import arkiv
from .arkiv import Attr
from .config import ROOT, optional, read_deployments
from .hedera import format_usdc, hashscan_tx
from .registry import decode, new_logs, splitter_ids
from .solidity import load_abi

SCHEMA = "overdraft.bureau"
DAY = arkiv.BLOCKS_PER_DAY
LIFETIME_BLOCKS = {"decision": 90 * DAY, "loan": 180 * DAY, "disbursed": 180 * DAY, "repayment": 90 * DAY, "repaid": 180 * DAY,
                   "default": 90 * DAY}
STATE_PATH = ROOT / "python" / ".state" / "bureau.json"


def bureau_address() -> str:
    """The bureau wallet that owns every record; read-only deployments set it without the key."""
    return optional("ARKIV_BUREAU_ADDRESS") or arkiv.bureau().address


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"cursors": {}, "splitterAgents": {}}


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2) + "\n")


def records_for(name: str, args, tx_hash: str, state: dict) -> list[tuple[str, list[Attr]]]:
    splitter_agents = state["splitterAgents"]

    def base(kind: str, agent_id: int) -> list[Attr]:
        return [Attr("arkiv.schema", "str", SCHEMA), Attr("kind", "str", kind), Attr("agentId", "u64", agent_id),
                Attr("hederaTx", "str", tx_hash, indexed=False)]

    if name == "LimitSet":
        splitter_agents[args["splitter"].lower()] = args["agentId"]
        return [("decision", base("decision", args["agentId"]) + [
            Attr("limit", "u64", args["limit"]),
            Attr("agent", "addr", args["agent"], indexed=False),
            Attr("owner", "addr", args["owner"], indexed=False),
            Attr("zgAccount", "addr", args["zgAccount"], indexed=False),
            Attr("decisionHash", "str", "0x" + bytes(args["decisionHash"]).hex(), indexed=False),
        ])]
    if name == "DrawRequested":
        return [("loan", base("loan", args["agentId"]) + [
            Attr("drawId", "u64", args["drawId"]),
            Attr("amount", "u64", args["amount"]),
            Attr("owedAfter", "u64", args["owedAfter"]),
            Attr("dueAt", "u64", args["dueAt"]),
            Attr("zgAccount", "addr", args["zgAccount"], indexed=False),
        ])]
    if name == "Disbursed":
        return [("disbursed", base("disbursed", args["agentId"]) + [
            Attr("drawId", "u64", args["drawId"]),
            Attr("zgTx", "str", "0x" + bytes(args["zgTxHash"]).hex(), indexed=False),
        ])]
    if name == "Swept":
        agent_id = splitter_agents.get(args.get("_splitter", ""))
        if agent_id is None or args["toPool"] == 0:
            return []
        return [("repayment", base("repayment", agent_id) + [
            Attr("amount", "u64", args["toPool"]),
            Attr("owedAfter", "u64", args["owedAfter"]),
        ])]
    if name == "IdReleased":
        return [("repaid", base("repaid", args["agentId"]))]
    if name == "Breach":
        state.setdefault("breachReasons", {})[str(args["agentId"])] = args["reason"][:120]
        return []
    if name == "Defaulted":
        reason = state.get("breachReasons", {}).get(str(args["agentId"]), "debt overdue past the grace period")
        return [("default", base("default", args["agentId"]) + [
            Attr("owed", "u64", args["owed"]),
            Attr("reason", "str", reason, indexed=False),
        ])]
    return []


def sync_once(state: dict) -> int:
    """Writes every new fact since the last sync to Arkiv in one batch. Returns how many were written."""
    deployments = read_deployments()
    w3 = Web3()
    splitter_abi = load_abi("IncomeSplitter")
    sources = [(deployments["creditLineContractId"], w3.eth.contract(abi=load_abi("CreditLine")))]
    sources += [(contract_id, w3.eth.contract(abi=splitter_abi)) for contract_id in splitter_ids()]
    pending: list[tuple[str, list[Attr]]] = []
    cursors = dict(state["cursors"])
    for contract_id, contract in sources:  # credit line first, so splitters map to agents
        for log in new_logs(contract_id, state["cursors"].get(contract_id)):
            decoded = decode(contract, log)
            if decoded:
                name, args = decoded
                args = dict(args)
                args["_splitter"] = log["address"].lower()
                pending.extend(records_for(name, args, log["transaction_hash"], state))
            cursors[contract_id] = {"timestamp": log["timestamp"], "index": log["index"]}

    if pending:
        result = arkiv.create_entities([(attrs, LIFETIME_BLOCKS[kind]) for kind, attrs in pending])
        kinds = ", ".join(kind for kind, _ in pending)
        print(f"{time.strftime('%H:%M:%S')} wrote {len(pending)} record(s) to Arkiv ({kinds}): "
              f"https://rabdi.explorer.arkiv.network/tx/{result['txHash']}", flush=True)
    state["cursors"] = cursors
    save_state(state)
    return len(pending)


def watch(interval: float, once: bool) -> None:
    state = load_state()
    print(f"Bureau {arkiv.bureau().address} writing schema '{SCHEMA}' to Arkiv", flush=True)
    while True:
        try:
            sync_once(state)
        except Exception as error:  # retried on the next round; cursors only advance after a successful write
            print(f"{time.strftime('%H:%M:%S')} bureau round failed: {str(error)[:160]}", flush=True)
            state = load_state()
        if once:
            return
        time.sleep(interval)


def report(agent_id: int) -> None:
    """Reads an agent's credit history back from Arkiv, filtered by the bureau wallet."""
    bureau = arkiv.bureau().address
    current = arkiv.block_timing()["current_block"]
    condition = f"arkiv.schema = str('{SCHEMA}') AND $owner = addr({bureau}) AND agentId = u64({agent_id})"
    page = arkiv.query(condition, select={"key": True, "expiresAt": True, "attributes": True, "count": True}, limit=100)
    rows = []
    for entity in page["data"]:
        attrs = {a["name"]: a["value"] for a in entity["attributes"]}
        days_left = (int(entity["expiresAt"], 16) - current) / DAY
        rows.append((attrs, days_left))
    print(f"Agent {agent_id}: {int(page.get('count', '0x0'), 16)} record(s) on Arkiv (owner {bureau})")
    order = {"refusal": 0, "underwriting": 0, "decision": 1, "loan": 2, "disbursed": 3, "repayment": 4, "repaid": 5, "default": 6}
    for attrs, days_left in sorted(rows, key=lambda r: (order.get(r[0]["kind"], 9), r[0].get("drawId", "0x0"))):
        if "record" in attrs:
            print_decision(agent_id, attrs, days_left)
            continue
        amount = attrs.get("amount") or attrs.get("limit") or attrs.get("owed")
        money = f" {format_usdc(int(amount, 16))}" if amount else ""
        owed = f", owed after {format_usdc(int(attrs['owedAfter'], 16))}" if "owedAfter" in attrs else ""
        reason = f" ({attrs['reason']})" if "reason" in attrs else ""
        print(f"  {attrs['kind']:<12}{money}{owed}{reason}  expires in {days_left:.0f} days  {hashscan_tx(attrs['hederaTx'])}")
    print(f"Query: {condition}")


def print_decision(agent_id: int, attrs: dict, days_left: float) -> None:
    """An underwriting decision: its memo, and whether it is the one the credit line on Hedera points to."""
    raw = bytes.fromhex(attrs["record"].removeprefix("0x"))
    record = json.loads(raw)
    intact = Web3.keccak(raw).to_0x_hex() == attrs["decisionHash"]
    on_chain = ""
    if record["facts"]["approved"]:
        from .cli import deployed
        from .hedera import web3

        credit_line, _ = deployed(web3(), "creditLine")
        current = "0x" + bytes(credit_line.functions.lines(agent_id).call()[5]).hex()
        on_chain = "; it is the decision behind the current limit on Hedera" if current == attrs["decisionHash"] else "; superseded"
    print(f"  {attrs['kind']:<12} limit {format_usdc(record['facts']['limit'])}  expires in {days_left:.0f} days  "
          f"(record {'matches' if intact else 'DOES NOT match'} its hash{on_chain})")
    print(f"               {record['memo']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Overdraft credit bureau on Arkiv.")
    sub = parser.add_subparsers(dest="command", required=True)
    w = sub.add_parser("watch")
    w.add_argument("--interval", type=float, default=10.0)
    w.add_argument("--once", action="store_true", help="sync once and exit")
    r = sub.add_parser("report")
    r.add_argument("agent_id", type=int)
    args = parser.parse_args()
    if args.command == "watch":
        watch(args.interval, args.once)
    else:
        report(args.agent_id)


if __name__ == "__main__":
    main()

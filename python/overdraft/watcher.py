"""Watcher: catches agents that break the terms of their credit line while they owe, and defaults them.

For every line with debt outstanding it checks three things:

1. Income still goes to the splitter. It asks the agent's paid endpoint for its price, as any customer
   would (the x402 "payment required" reply), and checks the payTo is the agent's splitter. Two
   mismatches in a row are a breach.
2. Borrowed compute stays in the agent's 0G account. 0G's PaymentVault lets an account move its credit
   to another account (transferCredit), which would take borrowed compute out of reach. A transfer out
   of the agent's 0G account while it owes is a breach.
3. Repayment is on time. A debt still outstanding after the due date plus the grace period is marked
   overdue (anyone may do this).

A breach or an overdue debt defaults the line: the agent's ID goes to the lender's treasury and the
bureau records the default on Arkiv.

    python -m overdraft.watcher [--interval 60] [--once]

Agents' paid endpoints come from WATCH_ENDPOINTS ("agentId=url,agentId=url"). An endpoint can show the
watcher a different payTo than its customers, so this check detects careless or lasting redirects;
it can't prove every payment reached the splitter.
"""

import argparse
import base64
import json
import time

import requests
from web3 import Web3

from . import zg
from .bureau import decode, new_logs
from .cli import deployed, format_usdc, tx_link
from .config import ROOT, optional, read_deployments
from .hedera import contract_id_of, operator, send, web3
from .solidity import load_abi

STATE_PATH = ROOT / "python" / ".state" / "watcher.json"
MISMATCHES_TO_BREACH = 2
ZG_BLOCK_CHUNK = 5_000
CREDIT_TRANSFERRED = Web3.keccak(text="CreditTransferred(address,address,uint256)").to_0x_hex()
ACTIVE = 1


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"mismatches": {}, "zgBlock": None}


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2) + "\n")


def endpoints() -> dict[int, str]:
    pairs = [p.split("=", 1) for p in (optional("WATCH_ENDPOINTS") or "").split(",") if "=" in p]
    return {int(agent_id): url.strip() for agent_id, url in pairs}


def agent_ids() -> list[int]:
    """Every agent the underwriter has given a line, from the CreditLine's LimitSet events."""
    contract = Web3().eth.contract(abi=load_abi("CreditLine"))
    ids = set()
    for log in new_logs(read_deployments()["creditLineContractId"], None):
        decoded = decode(contract, log)
        if decoded and decoded[0] == "LimitSet":
            ids.add(decoded[1]["agentId"])
    return sorted(ids)


def advertised_pay_to(url: str) -> set[str]:
    """The payTo accounts an x402 endpoint asks customers to pay, from its 402 reply."""
    response = requests.post(url, json={}, timeout=20)
    if response.status_code != 402:
        raise RuntimeError(f"expected 402 Payment Required, got {response.status_code}")
    header = response.headers.get("PAYMENT-REQUIRED")
    body = json.loads(base64.b64decode(header)) if header else response.json()
    return {option["payTo"] for option in body.get("accepts", [])}


def credit_transfers(zg_accounts: list[str], state: dict) -> list[dict]:
    """CreditTransferred events out of the given 0G accounts since the last check."""
    w3 = zg.web3()
    latest = w3.eth.block_number
    start = state["zgBlock"] + 1 if state["zgBlock"] is not None else latest - ZG_BLOCK_CHUNK
    found = []
    topics = [CREDIT_TRANSFERRED, ["0x" + a.lower().removeprefix("0x").rjust(64, "0") for a in zg_accounts]]
    while start <= latest:
        end = min(start + ZG_BLOCK_CHUNK - 1, latest)
        for log in w3.eth.get_logs({"address": zg.PAYMENT_VAULT, "fromBlock": start, "toBlock": end, "topics": topics}):
            found.append({
                "from": Web3.to_checksum_address("0x" + log["topics"][1].hex()[-40:]),
                "to": Web3.to_checksum_address("0x" + log["topics"][2].hex()[-40:]),
                "amount": int.from_bytes(log["data"], "big"),
                "tx": log["transactionHash"].to_0x_hex(),
            })
        state["zgBlock"] = end
        start = end + 1
    return found


def default_line(w3, credit_line, function_name: str, *args) -> None:
    account = operator()
    tx = getattr(credit_line.functions, function_name)(*args).build_transaction({"from": account.address, "gas": 400_000})
    print(f"{time.strftime('%H:%M:%S')} {function_name}{args}: line defaulted  {tx_link(send(w3, account, tx))}", flush=True)


def check_once(state: dict) -> None:
    w3 = web3()
    credit_line, _ = deployed(w3, "creditLine")
    grace = credit_line.functions.graceSeconds().call()
    urls = endpoints()
    owing = {}
    for agent_id in agent_ids():
        agent, owner, splitter, zg_account, limit, _, due_at, id_locked, status = credit_line.functions.lines(agent_id).call()
        if status != ACTIVE:
            continue
        owed = credit_line.functions.owedOf(agent_id).call()
        if owed == 0:
            state["mismatches"].pop(str(agent_id), None)
            continue
        owing[agent_id] = {"splitter": splitter, "zgAccount": zg_account, "owed": owed, "dueAt": due_at}

    for agent_id, line in owing.items():
        # 3. Overdue.
        if time.time() > line["dueAt"] + grace:
            default_line(w3, credit_line, "markOverdue", agent_id)
            line["done"] = True
            continue
        # 1. Income redirected away from the splitter.
        url = urls.get(agent_id)
        if not url:
            continue
        expected = contract_id_of(line["splitter"])
        try:
            pay_to = advertised_pay_to(url)
        except Exception as error:  # an unreachable endpoint isn't a breach; it earns nothing either
            print(f"{time.strftime('%H:%M:%S')} agent {agent_id}: endpoint unreachable ({str(error)[:80]})", flush=True)
            continue
        key = str(agent_id)
        if expected in pay_to:
            state["mismatches"].pop(key, None)
            continue
        state["mismatches"][key] = state["mismatches"].get(key, 0) + 1
        print(f"{time.strftime('%H:%M:%S')} agent {agent_id}: endpoint asks customers to pay {', '.join(sorted(pay_to))}, "
              f"not its splitter {expected} ({state['mismatches'][key]}/{MISMATCHES_TO_BREACH})", flush=True)
        if state["mismatches"][key] >= MISMATCHES_TO_BREACH:
            default_line(w3, credit_line, "flagBreach", agent_id, f"x402 payTo {sorted(pay_to)[0]} is not the splitter {expected}")
            state["mismatches"].pop(key, None)
            line["done"] = True

    # 2. Compute credit moved out of a 0G account that owes.
    live: dict[str, list[int]] = {}
    for agent_id, line in owing.items():
        if not line.get("done"):
            live.setdefault(line["zgAccount"], []).append(agent_id)
    if live:
        try:
            for transfer in credit_transfers(list(live), state):
                for agent_id in live.get(transfer["from"], []):
                    if owing[agent_id].get("done"):
                        continue
                    reason = f"0G credit moved out of the agent's compute account to {transfer['to']} ({transfer['tx']})"
                    print(f"{time.strftime('%H:%M:%S')} agent {agent_id}: {reason}", flush=True)
                    default_line(w3, credit_line, "flagBreach", agent_id, reason[:120])
                    owing[agent_id]["done"] = True
        except Exception as error:  # retried next round from the same block
            print(f"{time.strftime('%H:%M:%S')} 0G check failed: {str(error)[:120]}", flush=True)

    watched = ", ".join(f"{a} owes {format_usdc(l['owed'])}" for a, l in owing.items() if not l.get("done"))
    print(f"{time.strftime('%H:%M:%S')} checked {len(owing)} line(s) with debt" + (f": {watched}" if watched else ""), flush=True)
    save_state(state)


def main() -> None:
    parser = argparse.ArgumentParser(description="Default agents that break their credit terms.")
    parser.add_argument("--interval", type=float, default=60.0)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    print(f"Watcher: probing {len(endpoints())} endpoint(s), watching 0G credit transfers and due dates every {args.interval:.0f}s", flush=True)
    while True:
        state = load_state()
        try:
            check_once(state)
        except Exception as error:
            print(f"{time.strftime('%H:%M:%S')} watcher round failed: {str(error)[:160]}", flush=True)
        if args.once:
            return
        time.sleep(args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Watcher stopped.")

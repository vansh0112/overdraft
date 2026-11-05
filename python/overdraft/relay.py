"""Relay: turns Overdraft activity on Hedera into 0G compute for the agent.

- Each loan request (CreditLine DrawRequested) is deposited into the agent's 0G compute account with
  PaymentVault.depositFor, then recorded on the CreditLine with markDisbursed.
- Each income split's compute share (IncomeSplitter Swept.toCompute) is deposited the same way, so the
  agent's earnings keep paying for its own inference.

Amounts are converted from USD with the ZG_PRICE_USD snapshot. Every deposit is capped per transfer and
per day, and a loan is never deposited twice: the CreditLine and the local state are both checked first.
With COMPUTE_MODE=placeholder the relay only simulates each deposit against the live PaymentVault.

    python -m overdraft.relay [--interval 10] [--once] [--skip-existing]
"""

import argparse
import json
import time

from web3 import Web3

from . import zg
from .bureau import decode, new_logs, splitter_ids
from .cli import deployed, tx_link
from .config import ROOT, optional, read_deployments
from .hedera import operator, send, web3 as hedera_web3
from .solidity import load_abi

LIVE = (optional("COMPUTE_MODE") or "placeholder") == "0g"
# Separate progress per mode, so loans only simulated in placeholder mode are still handled when live.
STATE_PATH = ROOT / "python" / ".state" / ("relay-live.json" if LIVE else "relay-placeholder.json")
MAX_DEPOSIT_0G = float(optional("ZG_MAX_DEPOSIT_0G") or "1.0")
DAILY_CAP_0G = float(optional("ZG_DAILY_CAP_0G") or "5.0")


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"cursors": {}, "lines": {}, "draws": {}, "topups": {}, "spent": {}}


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2) + "\n")


def within_caps(state: dict, amount_wei: int) -> str | None:
    """Returns why a deposit is refused, or None if it is within the caps."""
    if amount_wei > MAX_DEPOSIT_0G * zg.WEI:
        return f"over the per-deposit cap of {MAX_DEPOSIT_0G} 0G"
    today = time.strftime("%Y-%m-%d")
    if int(state["spent"].get(today, 0)) + amount_wei > DAILY_CAP_0G * zg.WEI:
        return f"over the daily cap of {DAILY_CAP_0G} 0G"
    return None


def deposit(state: dict, to: str, amount_usd: float, label: str) -> str | None:
    """Deposits (or, in placeholder mode, simulates) amount_usd of 0G into `to`. Returns the 0G tx hash if real."""
    amount_wei = zg.usd_to_wei(amount_usd)
    refusal = within_caps(state, amount_wei)
    if refusal:
        print(f"{time.strftime('%H:%M:%S')} {label}: refused, {refusal}", flush=True)
        return None
    amount_0g = amount_wei / zg.WEI
    if not LIVE:
        sim = zg.simulate_deposit(to, amount_wei)
        print(f"{time.strftime('%H:%M:%S')} {label}: [simulation] depositFor({to}) {amount_0g:.6f} 0G "
              f"(${amount_usd:.4f} at ${zg.price_usd()}/0G) -> {'ok' if sim['ok'] else 'FAILED'}", flush=True)
        return None
    tx_hash = zg.deposit_for(to, amount_wei)
    today = time.strftime("%Y-%m-%d")
    state["spent"][today] = int(state["spent"].get(today, 0)) + amount_wei
    print(f"{time.strftime('%H:%M:%S')} {label}: deposited {amount_0g:.6f} 0G (${amount_usd:.4f} at ${zg.price_usd()}/0G) "
          f"into {to}  {zg.tx_url(tx_hash)}", flush=True)
    return tx_hash


def draw_key(credit_line_id: str, draw_id: int) -> str:
    """Loan numbers restart with each CreditLine, so records are kept per contract."""
    return f"{credit_line_id}:{draw_id}"


def handle_draw(state: dict, credit_line, credit_line_id: str, args) -> None:
    draw_id = str(args["drawId"])
    record = state["draws"].setdefault(draw_key(credit_line_id, args["drawId"]), {})
    if record.get("marked") or record.get("skipped") or record.get("refused"):
        return
    _, _, zg_tx_on_chain = credit_line.functions.draws(args["drawId"]).call()
    if any(zg_tx_on_chain):
        record["marked"] = True  # already disbursed and recorded
        return
    if not record.get("zgTx"):
        status = credit_line.functions.lines(args["agentId"]).call()[-1]
        if status != 1:  # the line defaulted before the deposit went out: don't fund it
            record["refused"] = "line defaulted"
            print(f"{time.strftime('%H:%M:%S')} loan #{draw_id}: not deposited, agent {args['agentId']}'s line has defaulted", flush=True)
            return
        tx_hash = deposit(state, args["zgAccount"], args["amount"] / 1_000_000, f"loan #{draw_id}")
        if not tx_hash:
            return
        record["zgTx"] = tx_hash
        save_state(state)  # persist before recording on Hedera, so a retry never deposits twice
    w3, relayer = hedera_web3(), operator()
    tx = credit_line.functions.markDisbursed(args["drawId"], Web3.to_bytes(hexstr=record["zgTx"])).build_transaction(
        {"from": relayer.address, "gas": 150_000}
    )
    print(f"{time.strftime('%H:%M:%S')} loan #{draw_id}: markDisbursed on Hedera  {tx_link(send(w3, relayer, tx))}", flush=True)
    record["marked"] = True


def handle_sweep(state: dict, splitter_address: str, args, log_id: str) -> None:
    if args["toCompute"] == 0 or log_id in state["topups"]:
        return
    line = state["lines"].get(splitter_address)
    if not line:
        return
    tx_hash = deposit(state, line["zgAccount"], args["toCompute"] / 1_000_000, f"compute top-up from income ({log_id[:12]}…)")
    state["topups"][log_id] = tx_hash or ("simulated" if not LIVE else None)


def sync_once(state: dict, skip_existing: bool) -> None:
    deployments = read_deployments()
    credit_line, _ = deployed(hedera_web3(), "creditLine")
    splitter_abi = load_abi("IncomeSplitter")
    sources = [(deployments["creditLineContractId"], Web3().eth.contract(abi=load_abi("CreditLine")))]
    sources += [(contract_id, Web3().eth.contract(abi=splitter_abi)) for contract_id in splitter_ids(deployments)]
    first_run = not state["cursors"]
    for contract_id, contract in sources:
        for log in new_logs(contract_id, state["cursors"].get(contract_id)):
            decoded = decode(contract, log)
            if decoded:
                name, args = decoded
                log_id = f"{log['transaction_hash']}:{log['index']}"
                if name == "LimitSet":
                    state["lines"][args["splitter"].lower()] = {"agentId": args["agentId"], "zgAccount": args["zgAccount"]}
                elif name == "DrawRequested":
                    if first_run and skip_existing:
                        state["draws"][draw_key(contract_id, args["drawId"])] = {"skipped": True}
                    else:
                        handle_draw(state, credit_line, contract_id, args)
                elif name == "Swept" and not (first_run and skip_existing):
                    handle_sweep(state, log["address"].lower(), args, log_id)
            state["cursors"][contract_id] = {"timestamp": log["timestamp"], "index": log["index"]}
            save_state(state)


def main() -> None:
    parser = argparse.ArgumentParser(description="Deposit loans and compute top-ups into agents' 0G compute accounts.")
    parser.add_argument("--interval", type=float, default=10.0)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--skip-existing", action="store_true", help="on the first run, ignore loans and splits that already exist")
    args = parser.parse_args()
    mode = "LIVE deposits on 0G mainnet" if LIVE else "placeholder mode: deposits are simulated, nothing is spent"
    print(f"Relay: {mode}; caps {MAX_DEPOSIT_0G} 0G per deposit, {DAILY_CAP_0G} 0G per day", flush=True)
    while True:
        state = load_state()
        try:
            sync_once(state, args.skip_existing)
        except Exception as error:  # cursors and per-loan records are saved as they advance; retried next round
            print(f"{time.strftime('%H:%M:%S')} relay round failed: {str(error)[:200]}", flush=True)
        if args.once:
            return
        time.sleep(args.interval)


if __name__ == "__main__":
    main()

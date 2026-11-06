"""Sweeper: splits every agent's income continuously, so loans repay themselves, and returns an agent's
ID as soon as its debt reaches zero.

Receiving USDC on Hedera runs no contract code, so something has to call IncomeSplitter.sweep().
Anyone may call it and it can only pay the recipients fixed at deployment. The sweeper reads each
splitter's USDC balance with a free read-only call and sweeps only when there is something to split.

    python -m overdraft.sweeper [--interval 5] [--min 0.01]
"""

import argparse
import time

from web3.logs import DISCARD

from . import registry
from .cli import deployed, format_usdc, tx_link
from .config import read_deployments, required
from .hedera import long_zero_address, operator, send, web3
from .solidity import load_abi

BALANCE_OF_ABI = [
    {"name": "balanceOf", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "account", "type": "address"}], "outputs": [{"name": "", "type": "uint256"}]}
]


def splitters() -> list[tuple[str, str]]:
    """(label, EVM address) for every agent's splitter: each line's, plus any named in the deployments file."""
    out = {line.splitter.lower(): (f"agent {line.agent_id}", line.splitter) for line in registry.lines()}
    deployments = read_deployments()
    named = [("main", deployments.get("splitterEvmAddress"))]
    named += [(name, entry["evmAddress"]) for name, entry in deployments.get("splitters", {}).items()]
    for name, address in named:
        if address and address.lower() not in out:
            out[address.lower()] = (name, address)
    return list(out.values())


def release_if_repaid(w3, account, credit_line, splitter_address: str) -> None:
    agent_id = credit_line.functions.agentOfSplitter(splitter_address).call()
    _, _, _, _, _, _, _, id_locked, status = credit_line.functions.lines(agent_id).call()
    if status == 1 and id_locked and credit_line.functions.owedOf(agent_id).call() == 0:
        tx = credit_line.functions.releaseId(agent_id).build_transaction({"from": account.address, "gas": 300_000})
        print(f"{time.strftime('%H:%M:%S')} agent {agent_id} repaid in full: ID returned to its owner  {tx_link(send(w3, account, tx))}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Split agents' income continuously.")
    parser.add_argument("--interval", type=float, default=5.0, help="seconds between checks")
    parser.add_argument("--min", type=float, default=0.01, help="smallest balance worth splitting, in USDC")
    args = parser.parse_args()

    w3, account = web3(), operator()
    credit_line, _ = deployed(w3, "creditLine")
    usdc = w3.eth.contract(address=long_zero_address(required("USDC_TOKEN_ID")), abi=BALANCE_OF_ABI)
    splitter_abi = load_abi("IncomeSplitter")
    minimum = round(args.min * 1_000_000)
    print(f"Sweeping {len(splitters())} splitter(s) every {args.interval}s (min {format_usdc(minimum)}); "
          "newly enrolled agents are picked up as their lines open", flush=True)

    while True:
        try:
            current = splitters()
        except Exception as error:  # mirror node busy: retry next round
            print(f"{time.strftime('%H:%M:%S')} couldn't list splitters: {str(error)[:120]}", flush=True)
            current = []
        for name, address in current:
            try:
                splitter = w3.eth.contract(address=address, abi=splitter_abi)
                if usdc.functions.balanceOf(address).call() >= minimum:
                    tx = splitter.functions.sweep().build_transaction({"from": account.address, "gas": 500_000})
                    receipt = send(w3, account, tx)
                    for event in splitter.events.Swept().process_receipt(receipt, errors=DISCARD):
                        a = event["args"]
                        print(f"{time.strftime('%H:%M:%S')} [{name}] split {format_usdc(a['total'])}: lender {format_usdc(a['toPool'])}, "
                              f"compute {format_usdc(a['toCompute'])}, owner {format_usdc(a['toOwner'])}; "
                              f"owed {format_usdc(a['owedAfter'])}  {tx_link(receipt)}", flush=True)
                release_if_repaid(w3, account, credit_line, address)
            except Exception as error:  # a failed round is retried on the next interval
                print(f"{time.strftime('%H:%M:%S')} [{name}] round failed: {str(error)[:160]}", flush=True)
        time.sleep(args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Sweeper stopped.")

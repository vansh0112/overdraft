"""Free dry run of an Overdraft loan on 0G mainnet.

Simulates, against 0G's live PaymentVault, the exact call a loan makes: read the agent's compute balance,
depositFor(agent) with the loan, read the balance again. Nothing is spent and nothing is written.

    python -m overdraft.zg_dryrun [--amount 0.5] [--to 0x...] [--out result.json]
"""

import argparse
import json
import os
import time
from pathlib import Path

from web3 import Web3

from . import zg
from .config import optional


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulate an Overdraft loan deposit on 0G mainnet (nothing is spent).")
    parser.add_argument("--amount", type=float, default=0.5, help="loan size in 0G (default 0.5)")
    parser.add_argument("--to", help="the agent's 0G compute account (defaults to ZG_AGENT_ADDRESS, else a random address)")
    parser.add_argument("--out", type=Path, help="also write the result as JSON to this file")
    args = parser.parse_args()

    agent = Web3.to_checksum_address(args.to or optional("ZG_AGENT_ADDRESS") or "0x" + os.urandom(20).hex())
    amount_wei = int(args.amount * zg.WEI)
    w3 = zg.web3()
    sim = zg.simulate_deposit(agent, amount_wei)
    result = {
        "network": "0G mainnet",
        "chainId": zg.CHAIN_ID,
        "block": w3.eth.block_number,
        "paymentVault": zg.PAYMENT_VAULT,
        "agent": agent,
        "loan0G": args.amount,
        "balanceBefore0G": sim["before_wei"] / zg.WEI,
        "balanceAfter0G": sim["after_wei"] / zg.WEI,
        "ok": sim["ok"],
        "simulatedAt": time.strftime("%Y-%m-%d %H:%M:%S %Z"),
    }
    print(f"0G mainnet block {result['block']}, PaymentVault {zg.PAYMENT_VAULT}")
    print(f"Agent {agent}: {result['balanceBefore0G']} 0G -> depositFor {args.amount} 0G -> {result['balanceAfter0G']} 0G")
    print("DRY RUN:", "PASSED" if sim["ok"] else "FAILED")
    if args.out:
        args.out.write_text(json.dumps(result, indent=2) + "\n")
        print(f"Saved: {args.out}")


if __name__ == "__main__":
    main()

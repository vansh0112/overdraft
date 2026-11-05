"""Demo scenario: an agent whose earnings are faked, for the underwriter to refuse.

The owner of a new agent funds three wallets (one through a middleman) and has them "pay" the agent,
so its income looks like several customers. One real customer also pays it once. The underwriter
traces each customer's money back and refuses the line.

    python -m overdraft.scenarios fake-earnings [--apply]

Uses the HEDERA_FAKE_* accounts in .env (create them with the gateway's create-accounts script) and
the lender's operator account as outside money. Every transfer is real USDC on Hedera testnet.
"""

import argparse
import time

from .cli import register_agent, send_usdc
from .config import optional, required
from .underwriter import underwrite

PRICE = "0.02"


def fake_earnings(apply: bool) -> None:
    owner, agent = required("HEDERA_FAKE_OWNER_ID"), required("HEDERA_FAKE_AGENT_ID")
    middle = required("HEDERA_FAKE_MIDDLE_ID")
    fake_customers = [("FAKE_CUST1", 3), ("FAKE_CUST2", 3), ("FAKE_CUST3", 2)]

    print("1. The owner gets outside money, then funds wallets to pose as customers")
    send_usdc(owner, "0.30", "OPERATOR", wait=False)
    send_usdc(required("HEDERA_FAKE_CUST1_ID"), "0.08", "FAKE_OWNER", wait=False)
    send_usdc(required("HEDERA_FAKE_CUST2_ID"), "0.08", "FAKE_OWNER", wait=False)
    send_usdc(middle, "0.08", "FAKE_OWNER", wait=False)
    send_usdc(required("HEDERA_FAKE_CUST3_ID"), "0.06", "FAKE_MIDDLE", wait=False)  # one hop removed

    print("2. The posing customers 'pay' the agent per job; one real customer pays once")
    for name, jobs in fake_customers:
        for _ in range(jobs):
            send_usdc(agent, PRICE, name, wait=False)
    send_usdc(agent, PRICE, "CUSTOMER", wait=False)

    print("3. The owner registers the agent's ERC-8004 ID and applies for credit")
    agent_id = int(optional("FAKE_AGENT_CREDIT_ID") or 0) or register_agent("FAKE_OWNER", "https://example.invalid/fake-agent")
    time.sleep(8)  # let the mirror node catch up
    underwrite(agent_id, agent, [agent], "main", None, 0.01, apply)


def main() -> None:
    parser = argparse.ArgumentParser(description="Overdraft demo scenarios.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("fake-earnings").add_argument("--apply", action="store_true", help="publish the refusal on Arkiv")
    a = parser.parse_args()
    fake_earnings(a.apply)


if __name__ == "__main__":
    main()

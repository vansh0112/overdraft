"""Sweeper: splits the agent's income continuously, so the loan repays itself.

Receiving USDC on Hedera runs no contract code, so something has to call IncomeSplitter.sweep().
Anyone may call it and it can only pay the recipients fixed at deployment. The sweeper reads the
splitter's USDC balance with a free read-only call and sweeps only when there is something to split.

    python -m overdraft.sweeper [--interval 5] [--min 0.01]
"""

import argparse
import time

from web3.logs import DISCARD

from .cli import deployed, format_usdc, tx_link
from .config import required
from .hedera import long_zero_address, operator, send, web3

BALANCE_OF_ABI = [
    {
        "name": "balanceOf",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
    }
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Split the agent's income continuously.")
    parser.add_argument("--interval", type=float, default=5.0, help="seconds between checks")
    parser.add_argument("--min", type=float, default=0.01, help="smallest balance worth splitting, in USDC")
    args = parser.parse_args()

    w3, account = web3(), operator()
    splitter, deployments = deployed(w3, "splitter")
    usdc = w3.eth.contract(address=long_zero_address(required("USDC_TOKEN_ID")), abi=BALANCE_OF_ABI)
    minimum = round(args.min * 1_000_000)
    print(f"Sweeping splitter {deployments['splitterContractId']} every {args.interval}s (min {format_usdc(minimum)})")

    while True:
        try:
            balance = usdc.functions.balanceOf(splitter.address).call()
            if balance >= minimum:
                tx = splitter.functions.sweep().build_transaction({"from": account.address, "gas": 500_000})
                receipt = send(w3, account, tx)
                for event in splitter.events.Swept().process_receipt(receipt, errors=DISCARD):
                    a = event["args"]
                    print(
                        f"{time.strftime('%H:%M:%S')} split {format_usdc(a['total'])}: lender {format_usdc(a['toPool'])}, "
                        f"compute {format_usdc(a['toCompute'])}, owner {format_usdc(a['toOwner'])}; "
                        f"owed {format_usdc(a['owedAfter'])}  {tx_link(receipt)}",
                        flush=True,
                    )
        except KeyboardInterrupt:
            raise
        except Exception as error:  # a failed round is retried on the next interval
            print(f"{time.strftime('%H:%M:%S')} sweep round failed: {str(error)[:160]}", flush=True)
        time.sleep(args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Sweeper stopped.")

"""Borrower kit: lets an agent borrow its own compute shortfall from the CreditLine on Hedera.

The agent compares the AI cost of the jobs waiting with its compute balance. When it is short, it checks
its available credit with a read-only call (so it never sends a request the contract would refuse) and
signs requestDraw itself.
"""

import math
import threading
from dataclasses import dataclass

from eth_account import Account
from web3.logs import DISCARD

from ..config import read_deployments, required
from ..hedera import hashscan_tx, send, web3
from ..solidity import load_abi

USDC = 1_000_000
BPS = 10_000


@dataclass
class Loan:
    draw_id: int
    amount_usd: float
    owed_after_usd: float
    tx_url: str


class Borrower:
    def __init__(self, agent_id: int):
        self.agent_id = agent_id
        self.account = Account.from_key(required("HEDERA_AGENT_KEY"))
        self._w3 = web3()
        address = read_deployments().get("creditLineEvmAddress")
        if not address:
            raise SystemExit("No CreditLine deployed. Run: python -m overdraft.cli deploy-credit-line")
        self._credit_line = self._w3.eth.contract(address=address, abi=load_abi("CreditLine"))
        self.fee_bps = self._credit_line.functions.feeBps().call()
        self._in_flight = threading.Lock()

    def shortfall_usd(self, jobs_waiting: int, cost_per_job_usd: float, balance_usd: float) -> float:
        return max(0.0, jobs_waiting * cost_per_job_usd - balance_usd)

    def available_usd(self) -> float:
        return self._credit_line.functions.availableOf(self.agent_id).call() / USDC

    def owed_usd(self) -> float:
        return self._credit_line.functions.owedOf(self.agent_id).call() / USDC

    def borrow(self, shortfall_usd: float) -> Loan | None:
        """Requests the shortfall (rounded up to the cent), capped by available credit. One request at a time."""
        if shortfall_usd <= 0 or not self._in_flight.acquire(blocking=False):
            return None
        try:
            available = self.available_usd()
            max_principal = available * BPS / (BPS + self.fee_bps)
            amount = min(math.ceil(shortfall_usd * 100) / 100, math.floor(max_principal * 100) / 100)
            if amount <= 0:
                return None
            tx = self._credit_line.functions.requestDraw(self.agent_id, round(amount * USDC)).build_transaction(
                {"from": self.account.address, "gas": 300_000}
            )
            receipt = send(self._w3, self.account, tx)
            for event in self._credit_line.events.DrawRequested().process_receipt(receipt, errors=DISCARD):
                args = event["args"]
                return Loan(
                    draw_id=args["drawId"],
                    amount_usd=args["amount"] / USDC,
                    owed_after_usd=args["owedAfter"] / USDC,
                    tx_url=hashscan_tx(receipt["transactionHash"].to_0x_hex()),
                )
            return None
        finally:
            self._in_flight.release()

"""The agent's AI budget.

PlaceholderCompute stands in for the agent's 0G compute account until the 0G relay and inference are
wired in: it tracks a USD balance locally and is labelled as a placeholder everywhere it is reported.
"""

import threading


class PlaceholderCompute:
    mode = "placeholder"

    def __init__(self, start_usd: float):
        self._balance = start_usd
        self._lock = threading.Lock()

    def balance_usd(self) -> float:
        with self._lock:
            return self._balance

    def try_charge(self, usd: float) -> bool:
        """Spends usd if the balance covers it."""
        with self._lock:
            if self._balance + 1e-9 < usd:
                return False
            self._balance -= usd
            return True

    def credit(self, usd: float) -> None:
        with self._lock:
            self._balance += usd

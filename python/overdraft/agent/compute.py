"""The agent's AI budget and AI work, in one of two modes (COMPUTE_MODE):

- placeholder: a local USD balance and a placeholder translation, clearly labelled, for running the
  Hedera side before the 0G account is funded;
- 0g: the agent's real 0G compute account. The balance is read from the Router (with a read-only
  management key) or the PaymentVault, and each job is real inference whose request ID and billed cost
  come back with the response.
"""

import threading
import time

from .. import zg
from ..config import optional, required

SYSTEM_PROMPT = "Translate the user's text into {to}. Reply with the translation only."
LANGUAGES = {"hi": "Hindi", "en": "English"}


class PlaceholderCompute:
    mode = "placeholder"
    default_cost_usd = 0.01

    def __init__(self, start_usd: float):
        self._balance = start_usd
        self._lock = threading.Lock()

    def balance_usd(self) -> float:
        with self._lock:
            return self._balance

    def reserve_usd(self) -> float:
        return 0.0

    def credit(self, usd: float) -> None:
        with self._lock:
            self._balance += usd

    def run_job(self, text: str, to: str, cost_usd: float, cheap: bool) -> dict:
        with self._lock:
            if self._balance + 1e-9 < cost_usd:
                raise zg.InsufficientBudget("placeholder balance too low")
            self._balance -= cost_usd
        return {"text": f"[placeholder translation of {len(text)} characters to {to}]", "request_id": None,
                "cost_usd": cost_usd, "model": "placeholder", "tee_verified": None}


class ZeroGCompute:
    mode = "0g"
    default_cost_usd = 0.0002

    def __init__(self):
        self.address = required("ZG_AGENT_ADDRESS")
        self._api_key = required("ZG_AGENT_API_KEY")
        self._management_key = optional("ZG_AGENT_MGMT_KEY")  # read-only (account:read) is enough
        self.model = optional("ZG_MODEL") or "qwen3.5-flash"
        self.cheap_model = optional("ZG_MODEL_CHEAP") or "qwen-flash"
        self._cached: tuple[float, float] | None = None
        self._lock = threading.Lock()

    def balance_usd(self) -> float:
        with self._lock:
            if self._cached and time.monotonic() - self._cached[0] < 3:
                return self._cached[1]
            wei = zg.router_balance_wei(self._management_key) if self._management_key else zg.vault_balance_wei(self.address)
            balance = zg.wei_to_usd(wei)
            self._cached = (time.monotonic(), balance)
            return balance

    def reserve_usd(self) -> float:
        return zg.ROUTER_MIN_COST_0G * zg.price_usd()

    def credit(self, usd: float) -> None:
        with self._lock:
            self._cached = None  # real deposits arrive through the relay; just re-read the balance

    def run_job(self, text: str, to: str, cost_usd: float, cheap: bool) -> dict:
        messages = [{"role": "system", "content": SYSTEM_PROMPT.format(to=LANGUAGES.get(to, to))},
                    {"role": "user", "content": text}]
        result = zg.chat(self._api_key, self.cheap_model if cheap else self.model, messages)
        with self._lock:
            self._cached = None
        return result


def make_compute(start_usd: float):
    mode = optional("COMPUTE_MODE") or "placeholder"
    if mode == "0g":
        return ZeroGCompute()
    if mode == "placeholder":
        return PlaceholderCompute(start_usd)
    raise SystemExit(f"Unknown COMPUTE_MODE '{mode}' (use 'placeholder' or '0g')")

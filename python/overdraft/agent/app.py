"""The borrower agent's internal service. Only the x402 gateway calls it, after a payment is verified.

Each paid job waits until the agent's AI budget covers it. When the jobs waiting cost more than the
balance, the agent borrows the shortfall from the CreditLine on Hedera by itself; the relay deposits the
loan into its 0G compute account. The gateway settles a payment only when this service returns success,
so a job that can't be served within the wait limit is not charged.

COMPUTE_MODE=0g uses the agent's real 0G compute account and real inference; COMPUTE_MODE=placeholder
(the default) uses a local balance and a placeholder translation.

    uvicorn overdraft.agent.app:app --port 5001
"""

import asyncio
import hmac
import os
import time
from collections import deque

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from ..zg import InsufficientBudget
from .borrower import Borrower
from .compute import make_compute

AGENT_ID = int(os.getenv("AGENT_CREDIT_ID", "1"))
START_BALANCE_USD = float(os.getenv("AGENT_START_BALANCE_USD", "0.02"))
WAIT_LIMIT_SECONDS = float(os.getenv("AGENT_JOB_WAIT_SECONDS", "90"))
BORROW_DEBOUNCE_SECONDS = float(os.getenv("AGENT_BORROW_DEBOUNCE_SECONDS", "3"))
INTERNAL_TOKEN = os.getenv("AGENT_INTERNAL_TOKEN", "")
if len(INTERNAL_TOKEN) < 20:
    raise SystemExit("Set AGENT_INTERNAL_TOKEN in .env (a long random value shared with the gateway).")

app = FastAPI(title="Overdraft borrower agent")
compute = make_compute(START_BALANCE_USD)
borrower = Borrower(AGENT_ID)
events: deque[dict] = deque(maxlen=200)
state = {
    "waiting": 0,
    "served": 0,
    "refused": 0,
    # Learned from the AI bills (each 0G response carries its cost); starts from an estimate.
    "costPerJobUsd": float(os.getenv("AGENT_AI_COST_USD") or compute.default_cost_usd),
}


class TranslateRequest(BaseModel):
    text: str = Field(default="", max_length=4000)
    to: str = Field(default="hi", max_length=16)


def require_gateway(x_internal_token: str = Header(default="")) -> None:
    """Only the x402 gateway, which holds the shared secret, may submit paid jobs."""
    if not hmac.compare_digest(x_internal_token.encode(), INTERNAL_TOKEN.encode()):
        raise HTTPException(status_code=401, detail="unauthorised")


def log(kind: str, detail: str, url: str | None = None, **extra) -> None:
    events.appendleft({"at": time.time(), "kind": kind, "detail": detail, "url": url, **extra})


def spendable(balance: float) -> float:
    return max(0.0, balance - compute.reserve_usd())


def tier(balance: float) -> str:
    jobs = spendable(balance) / state["costPerJobUsd"]
    if jobs >= 10:
        return "normal"
    if jobs >= 3:
        return "low"
    return "short" if jobs >= 1 else "empty"


async def ensure_budget() -> None:
    """Borrows the shortfall for every job currently waiting, if the balance can't cover them."""
    await asyncio.sleep(BORROW_DEBOUNCE_SECONDS)  # let a burst of paid jobs arrive, so one loan covers it
    balance = await asyncio.to_thread(compute.balance_usd)
    shortfall = borrower.shortfall_usd(state["waiting"], state["costPerJobUsd"], spendable(balance))
    if shortfall <= 0:
        return
    loan = await asyncio.to_thread(borrower.borrow, shortfall)
    if loan is None:
        if borrower.last_refusal:
            log("blocked", f"Can't borrow: {borrower.last_refusal}")
        return
    log("loan", f"Borrowed ${loan.amount_usd:.2f} for {state['waiting']} waiting jobs; owes ${loan.owed_after_usd:.4f}", loan.tx_url)
    if compute.mode == "placeholder":
        compute.credit(loan.amount_usd)
        log("deposit", f"${loan.amount_usd:.2f} added to the compute balance (placeholder)")
    else:
        log("deposit", f"Waiting for the relay to deposit ${loan.amount_usd:.2f} into the 0G compute account")


@app.post("/translate", dependencies=[Depends(require_gateway)])
async def translate(request: TranslateRequest) -> dict:
    state["waiting"] += 1
    try:
        asyncio.create_task(ensure_budget())
        deadline = time.monotonic() + WAIT_LIMIT_SECONDS
        checks = 0
        while True:
            balance = await asyncio.to_thread(compute.balance_usd)
            if spendable(balance) + 1e-9 >= state["costPerJobUsd"]:
                try:
                    cheap = tier(balance) in ("low", "short", "empty")
                    result = await asyncio.to_thread(compute.run_job, request.text, request.to, state["costPerJobUsd"], cheap)
                    break
                except InsufficientBudget:
                    pass
            checks += 1
            if checks % 10 == 0:
                asyncio.create_task(ensure_budget())  # still short: re-check the shortfall
            if time.monotonic() > deadline:
                state["refused"] += 1
                log("refused", "No AI budget within the wait limit; the customer is not charged")
                raise HTTPException(status_code=503, detail="Out of AI budget, try again later")
            await asyncio.sleep(0.5)

        if result["cost_usd"] > 0:
            state["costPerJobUsd"] = 0.8 * state["costPerJobUsd"] + 0.2 * result["cost_usd"]
        state["served"] += 1
        log("served", f"Served with {result['model']} for ${result['cost_usd']:.6f}",
            requestId=result["request_id"], teeVerified=result.get("tee_verified"))
        return {"translation": result["text"], "requestId": result["request_id"], "model": result["model"]}
    finally:
        state["waiting"] -= 1


_credit = {"owedUsd": None, "availableUsd": None}


async def credit() -> dict:
    """What the agent owes and can still borrow, read from the CreditLine. When a public Hedera node briefly
    fails, the last values read are kept, so the status still answers."""
    try:
        owed = await asyncio.to_thread(borrower.owed_usd)
        available = await asyncio.to_thread(borrower.available_usd)
        _credit.update(owedUsd=owed, availableUsd=available)
    except Exception as error:
        print(f"credit read skipped: {str(error)[:120]}", flush=True)
    return dict(_credit)


@app.get("/status")
async def status() -> dict:
    balance = await asyncio.to_thread(compute.balance_usd)
    return {
        "agentId": AGENT_ID,
        "computeMode": compute.mode,
        "balanceUsd": round(max(balance, 0.0), 6),
        "reserveUsd": round(compute.reserve_usd(), 6),
        "coversJobs": int(spendable(balance) / state["costPerJobUsd"] + 1e-9),
        "tier": tier(balance),
        **{k: (round(v, 6) if isinstance(v, float) else v) for k, v in state.items()},
        **await credit(),
        "events": list(events)[:50],
    }


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "computeMode": compute.mode}

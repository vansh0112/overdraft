"""The borrower agent's internal service. Only the x402 gateway calls it, after a payment is verified.

Each paid job waits until the agent's AI budget covers it. When the jobs waiting cost more than the
balance, the agent borrows the shortfall from the CreditLine on Hedera by itself. The gateway settles a
payment only when this service returns success, so a job that can't be served within the wait limit is
not charged.

The compute balance and the AI call are placeholders until the 0G relay and inference are wired in.

    uvicorn overdraft.agent.app:app --port 5001
"""

import asyncio
import os
import time
from collections import deque

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .borrower import Borrower
from .compute import PlaceholderCompute

AGENT_ID = int(os.getenv("AGENT_CREDIT_ID", "1"))
COST_PER_JOB_USD = float(os.getenv("AGENT_AI_COST_USD", "0.01"))
START_BALANCE_USD = float(os.getenv("AGENT_START_BALANCE_USD", "0.02"))
WAIT_LIMIT_SECONDS = float(os.getenv("AGENT_JOB_WAIT_SECONDS", "90"))

app = FastAPI(title="Overdraft borrower agent")
compute = PlaceholderCompute(START_BALANCE_USD)
borrower = Borrower(AGENT_ID)
events: deque[dict] = deque(maxlen=200)
state = {"waiting": 0, "served": 0, "refused": 0}


class TranslateRequest(BaseModel):
    text: str = ""
    to: str = "hi"


def log(kind: str, detail: str, url: str | None = None) -> None:
    events.appendleft({"at": time.time(), "kind": kind, "detail": detail, "url": url})


def tier(balance: float) -> str:
    jobs = balance / COST_PER_JOB_USD
    if jobs >= 10:
        return "normal"
    if jobs >= 3:
        return "low"
    return "short" if jobs >= 1 else "empty"


async def ensure_budget() -> None:
    """Borrows the shortfall for every job currently waiting, if the balance can't cover them."""
    await asyncio.sleep(1.0)  # let a burst of orders arrive, so it is covered by one loan
    shortfall = borrower.shortfall_usd(state["waiting"], COST_PER_JOB_USD, compute.balance_usd())
    if shortfall <= 0:
        return
    loan = await asyncio.to_thread(borrower.borrow, shortfall)
    if loan is None:
        return
    log("loan", f"Borrowed ${loan.amount_usd:.2f} for {state['waiting']} waiting jobs; owes ${loan.owed_after_usd:.3f}", loan.tx_url)
    # Placeholder for the 0G deposit: the relay will call depositFor on 0G and the balance will come from there.
    compute.credit(loan.amount_usd)
    log("deposit", f"${loan.amount_usd:.2f} added to the compute balance (placeholder until the 0G relay)")


@app.post("/translate")
async def translate(request: TranslateRequest) -> dict:
    state["waiting"] += 1
    try:
        asyncio.create_task(ensure_budget())
        deadline = time.monotonic() + WAIT_LIMIT_SECONDS
        checks = 0
        while not compute.try_charge(COST_PER_JOB_USD):
            checks += 1
            if checks % 10 == 0:
                asyncio.create_task(ensure_budget())  # still short: re-check the shortfall
            if time.monotonic() > deadline:
                state["refused"] += 1
                log("refused", "No AI budget within the wait limit; the customer is not charged")
                raise HTTPException(status_code=503, detail="Out of AI budget, try again later")
            await asyncio.sleep(0.5)
        state["served"] += 1
        log("served", f"Job served for ${COST_PER_JOB_USD:.2f} of AI (placeholder AI)")
        return {"translation": f"[placeholder translation of {len(request.text)} characters to {request.to}]"}
    finally:
        state["waiting"] -= 1


@app.get("/status")
async def status() -> dict:
    balance = compute.balance_usd()
    return {
        "agentId": AGENT_ID,
        "computeMode": compute.mode,
        "balanceUsd": round(max(balance, 0.0), 4),
        "coversJobs": int(balance / COST_PER_JOB_USD + 1e-9),
        "tier": tier(balance),
        "costPerJobUsd": COST_PER_JOB_USD,
        **state,
        "owedUsd": await asyncio.to_thread(borrower.owed_usd),
        "availableUsd": await asyncio.to_thread(borrower.available_usd),
        "events": list(events)[:50],
    }


@app.get("/health")
async def health() -> dict:
    return {"ok": True}

"""The borrower agent's internal service. Only the x402 gateway calls it, after a payment is verified.

Test 1 returns a placeholder; step 2 replaces it with 0G inference paid from the agent's compute balance.

    uvicorn overdraft.agent.app:app --port 5001
"""

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Overdraft borrower agent")


class TranslateRequest(BaseModel):
    text: str = ""
    to: str = "hi"


@app.post("/translate")
def translate(request: TranslateRequest) -> dict:
    return {"translation": f"[placeholder translation of {len(request.text)} characters to {request.to}]"}


@app.get("/health")
def health() -> dict:
    return {"ok": True}

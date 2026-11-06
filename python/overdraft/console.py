"""Console API: the read-only data behind the Overdraft console, plus password-protected demo controls.

Everything it returns is read from public sources (the CreditLine and splitters on Hedera, the mirror
node, the bureau on Arkiv) or from the agent's public status, so the console never shows a number the
chain can't back. Demo controls start a paid rush or re-run the fake-earnings check; they need the
CONSOLE_DEMO_PASSWORD in an x-demo-password header and run one at a time.

    uvicorn overdraft.console:app --port 8000
"""

import hmac
import json
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from functools import lru_cache, wraps

import requests
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from web3 import Web3

from . import arkiv, zg
from .bureau import SCHEMA, decode, new_logs
from .cli import IDENTITY_ABI, IDENTITY_REGISTRY, STATUS, deployed
from .config import ROOT, optional, read_deployments, required
from .hedera import MIRROR, contract_id_of, hashscan_contract, hashscan_tx, token_balance, web3
from .solidity import load_abi

USDC = 1_000_000
X402_FEE_PAYERS = {"0.0.9185802"}  # the x402.org facilitator pays the fees of x402 payments on Hedera testnet
CACHE_SECONDS = float(optional("CONSOLE_CACHE_SECONDS") or 5)
DEMO_PASSWORD = optional("CONSOLE_DEMO_PASSWORD") or ""
ORIGINS = [o.strip() for o in (optional("CONSOLE_ALLOWED_ORIGINS") or "http://localhost:3000").split(",") if o.strip()]

def warm_up() -> None:
    """Fills the cache once at start, so the first visitor doesn't wait for the chains."""
    try:
        overview()
        agents()
        activity(int(required("AGENT_CREDIT_ID")))
        bureau_history(int(required("AGENT_CREDIT_ID")))
    except Exception as error:
        print(f"warm-up skipped: {str(error)[:120]}", flush=True)


@asynccontextmanager
async def lifespan(_app):
    threading.Thread(target=warm_up, daemon=True).start()
    yield


app = FastAPI(title="Overdraft console API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["x-demo-password", "content-type"])


@app.exception_handler(requests.RequestException)
def upstream_unavailable(_request, error: requests.RequestException) -> JSONResponse:
    """A public node (Hedera mirror, Arkiv) is busy or down: say so instead of failing with a 500."""
    return JSONResponse(status_code=503, content={"detail": "a public node is busy, try again shortly", "upstream": str(error)[:160]})

_cache: dict[tuple, tuple[float, object]] = {}
_cache_lock = threading.Lock()


_refreshing: set[tuple] = set()


def cached(fn):
    """Keeps each result for a few seconds, so a console polling every second doesn't flood the RPC.

    After that the last result is still served at once while a fresh one is fetched in the background,
    so only the very first request for a value waits for the chains.
    """
    @wraps(fn)
    def wrapper(*args):
        key = (fn.__name__, *args)
        with _cache_lock:
            hit = _cache.get(key)
            stale = hit is not None and time.monotonic() - hit[0] >= CACHE_SECONDS
            refresh = stale and key not in _refreshing
            if refresh:
                _refreshing.add(key)
        if hit is None:
            value = fn(*args)
            with _cache_lock:
                _cache[key] = (time.monotonic(), value)
            return value
        if refresh:
            def run() -> None:
                try:
                    value = fn(*args)
                    with _cache_lock:
                        _cache[key] = (time.monotonic(), value)
                except Exception:  # keep serving the last good value; the next request retries
                    pass
                finally:
                    with _cache_lock:
                        _refreshing.discard(key)
            threading.Thread(target=run, daemon=True).start()
        return hit[1]
    return wrapper


_hedera = None
_hedera_lock = threading.Lock()


def hedera():
    """One reused Hedera JSON-RPC connection (connecting probes the endpoint, so it isn't done per request)."""
    global _hedera
    with _hedera_lock:
        if _hedera is None:
            _hedera = web3()
        return _hedera


@lru_cache(maxsize=None)
def contract_id(evm_address: str) -> str:
    return contract_id_of(evm_address)  # a contract's ID never changes


def usd(atomic: int) -> float:
    return round(atomic / USDC, 6)


def bureau_address() -> str:
    """The bureau wallet that owns every record; read-only deployments set it without the key."""
    return optional("ARKIV_BUREAU_ADDRESS") or arkiv.bureau().address


@cached
def contracts() -> dict:
    d = read_deployments()
    out = {
        "network": "hedera:testnet",
        "creditLine": {"id": d["creditLineContractId"], "url": hashscan_contract(d["creditLineContractId"])},
        "splitter": {"id": d["splitterContractId"], "url": hashscan_contract(d["splitterContractId"])},
        "identityRegistry": IDENTITY_REGISTRY,
        "usdc": required("USDC_TOKEN_ID"),
        "bureau": {"network": "arkiv:rabdi", "owner": bureau_address(), "schema": SCHEMA},
    }
    credit_line, _ = deployed(hedera(), "creditLine")
    out["terms"] = {
        "feeBps": credit_line.functions.feeBps().call(),
        "termSeconds": credit_line.functions.termSeconds().call(),
        "graceSeconds": credit_line.functions.graceSeconds().call(),
    }
    return out


@cached
def line(agent_id: int) -> dict:
    w3 = hedera()
    credit_line, deployments = deployed(w3, "creditLine")
    agent, owner, splitter, zg_account, limit, decision_hash, due_at, id_locked, status = credit_line.functions.lines(agent_id).call()
    if status == 0:
        raise HTTPException(status_code=404, detail="no credit line for this agent")
    identity = w3.eth.contract(address=Web3.to_checksum_address(IDENTITY_REGISTRY), abi=IDENTITY_ABI)
    with ThreadPoolExecutor(max_workers=4) as pool:
        owed_call = pool.submit(credit_line.functions.owedOf(agent_id).call)
        holder_call = pool.submit(identity.functions.ownerOf(agent_id).call)
        splitter_id = contract_id(splitter)
        balance_call = pool.submit(token_balance, splitter_id, required("USDC_TOKEN_ID"))
        events_call = pool.submit(contract_events, deployments["creditLineContractId"], "CreditLine")
        owed, holder, balance, events = owed_call.result(), holder_call.result(), balance_call.result(), events_call.result()
    deposited = {a["drawId"]: "0x" + bytes(a["zgTxHash"]).hex() for name, a, _ in events if name == "Disbursed"}
    loans = [{"id": a["drawId"], "amountUsd": usd(a["amount"]), "zgTx": deposited.get(a["drawId"])}
             for name, a, _ in events if name == "DrawRequested" and a["agentId"] == agent_id]
    return {
        "agentId": agent_id,
        "status": STATUS[status],
        "agent": agent,
        "owner": owner,
        "zgAccount": zg_account,
        "splitter": {"id": splitter_id, "url": hashscan_contract(splitter_id), "balanceUsd": usd(balance)},
        "limitUsd": usd(limit),
        "owedUsd": usd(owed),
        "availableUsd": usd(max(0, limit - owed) if status == 1 else 0),
        "dueAt": due_at or None,
        "decisionHash": "0x" + bytes(decision_hash).hex(),
        "collateral": {
            "locked": id_locked,
            "heldBy": "creditLine" if holder == credit_line.address else ("owner" if holder == owner else "treasury"),
            "holder": holder,
        },
        "loans": loans,
    }


def decode_attrs(entity: dict) -> dict:
    out = {}
    for a in entity["attributes"]:
        value = a["value"]
        if a["name"] in ("agentId", "limit", "amount", "owedAfter", "owed", "drawId", "dueAt") and isinstance(value, str):
            value = int(value, 16)
        out[a["name"]] = value
    return out


@cached
def bureau_history(agent_id: int) -> list[dict]:
    current = arkiv.block_timing()["current_block"]
    condition = f"arkiv.schema = str('{SCHEMA}') AND $owner = addr({bureau_address()}) AND agentId = u64({agent_id})"
    page = arkiv.query(condition, select={"key": True, "expiresAt": True, "attributes": True}, limit=100)
    records = []
    for entity in page["data"]:
        attrs = decode_attrs(entity)
        record = {"key": entity["key"], "kind": attrs["kind"], "expiresInDays": round((int(entity["expiresAt"], 16) - current) / arkiv.BLOCKS_PER_DAY, 1)}
        for name in ("amount", "limit", "owedAfter", "owed"):
            if name in attrs:
                record[f"{name}Usd"] = usd(attrs[name])
        for name in ("drawId", "dueAt", "reason", "zgTx"):
            if name in attrs:
                record[name] = attrs[name]
        if "hederaTx" in attrs:
            record["hederaTx"] = hashscan_tx(attrs["hederaTx"])
        if "record" in attrs:
            raw = bytes.fromhex(attrs["record"].removeprefix("0x"))
            decision = json.loads(raw)
            record["decision"] = decision
            record["hashMatches"] = Web3.keccak(raw).to_0x_hex() == attrs["decisionHash"]
            record["decisionHash"] = attrs["decisionHash"]
        records.append(record)
    order = {"underwriting": 0, "refusal": 0, "decision": 1, "loan": 2, "disbursed": 3, "repayment": 4, "repaid": 5, "default": 6}
    return sorted(records, key=lambda r: (order.get(r["kind"], 9), r.get("drawId", 0)))


_logs: dict[str, dict] = {}
_logs_lock = threading.Lock()


def contract_events(contract_id: str, abi_name: str) -> list[tuple[str, dict, dict]]:
    """(event name, args, log) for a contract, oldest first. After the first read only new logs are fetched."""
    with _logs_lock:
        entry = _logs.setdefault(contract_id, {"cursor": None, "events": []})
        contract = Web3().eth.contract(abi=load_abi(abi_name))
        for log in new_logs(contract_id, entry["cursor"]):
            decoded = decode(contract, log)
            if decoded:
                entry["events"].append((decoded[0], dict(decoded[1]), log))
            entry["cursor"] = {"timestamp": log["timestamp"], "index": log["index"]}
        return list(entry["events"])


def event(at: str, kind: str, title: str, url: str, **extra) -> dict:
    return {"at": float(at), "kind": kind, "title": title, "url": url, **extra}


@cached
def activity(agent_id: int) -> list[dict]:
    """Everything that happened on an agent's line, newest first, each with its transaction."""
    summary = line(agent_id)
    events = []
    for name, a, log in contract_events(read_deployments()["creditLineContractId"], "CreditLine"):
        if a.get("agentId") != agent_id:
            continue
        at, url = log["timestamp"], hashscan_tx(log["transaction_hash"])
        if name == "LimitSet":
            events.append(event(at, "limit", f"Credit limit set to ${usd(a['limit']):.2f}", url))
        elif name == "IdLocked":
            events.append(event(at, "locked", "Agent ID locked as collateral", url))
        elif name == "DrawRequested":
            events.append(event(at, "loan", f"Borrowed ${usd(a['amount']):.2f} of AI compute", url,
                                amountUsd=usd(a["amount"]), owedAfterUsd=usd(a["owedAfter"]), drawId=a["drawId"], dueAt=a["dueAt"]))
        elif name == "Disbursed":
            events.append(event(at, "deposit", f"Loan #{a['drawId']} deposited into 0G compute", zg.tx_url("0x" + bytes(a["zgTxHash"]).hex()),
                                drawId=a["drawId"]))
        elif name == "IdReleased":
            events.append(event(at, "released", "Repaid in full: ID returned to its owner", url))
        elif name == "Breach":
            events.append(event(at, "breach", f"Breach: {a['reason']}", url))
        elif name == "Defaulted":
            events.append(event(at, "default", f"Defaulted owing ${usd(a['owed']):.4f}: ID sent to the treasury", url))

    splitter_id = summary["splitter"]["id"]
    for name, a, log in contract_events(splitter_id, "IncomeSplitter"):
        if name == "Swept":
            events.append(event(log["timestamp"], "split", f"Income split: ${usd(a['total']):.2f}", hashscan_tx(log["transaction_hash"]),
                                toLenderUsd=usd(a["toPool"]), toComputeUsd=usd(a["toCompute"]), toOwnerUsd=usd(a["toOwner"]),
                                owedAfterUsd=usd(a["owedAfter"])))

    usdc = required("USDC_TOKEN_ID")
    body = requests.get(f"{MIRROR}/accounts/{splitter_id}?order=desc&limit=100", timeout=30).json()
    for tx in body.get("transactions", []):
        if tx["result"] != "SUCCESS":
            continue
        moves = [t for t in tx["token_transfers"] if t["token_id"] == usdc]
        received = sum(t["amount"] for t in moves if t["account"] == splitter_id)
        payers = [t["account"] for t in moves if t["amount"] < 0]
        if received > 0 and payers:
            via_x402 = tx["transaction_id"].split("-")[0] in X402_FEE_PAYERS
            events.append(event(tx["consensus_timestamp"], "payment", f"Customer paid ${usd(received):.2f}" + (" with x402" if via_x402 else ""),
                                hashscan_tx(tx["transaction_id"]), amountUsd=usd(received), payer=payers[0], x402=via_x402))
    return sorted(events, key=lambda e: -e["at"])[:80]


@cached
def refusals() -> list[dict]:
    """Agents the underwriter refused: they have a decision on Arkiv but no credit line."""
    condition = f"arkiv.schema = str('{SCHEMA}') AND $owner = addr({bureau_address()}) AND kind = str('refusal')"
    page = arkiv.query(condition, select={"attributes": True}, limit=100)
    out = {}
    for entity in page["data"]:
        attrs = decode_attrs(entity)
        record = json.loads(bytes.fromhex(attrs["record"].removeprefix("0x")))
        out[attrs["agentId"]] = {"agentId": attrs["agentId"], "status": "refused", "reason": record["facts"]["reasons"][0]}
    return list(out.values())


@cached
def agent_status() -> dict | None:
    try:
        return requests.get(f"{required('AGENT_INTERNAL_URL')}/status", timeout=10).json()
    except Exception:
        return None


@app.get("/api/overview")
def overview() -> dict:
    agent_id = int(required("AGENT_CREDIT_ID"))
    return {"contracts": contracts(), "agent": agent_status(), "line": line(agent_id)}


@app.get("/api/agents")
def agents() -> list[dict]:
    out = []
    lined = sorted({a["agentId"] for name, a, _ in contract_events(read_deployments()["creditLineContractId"], "CreditLine") if name == "LimitSet"})
    with ThreadPoolExecutor(max_workers=4) as pool:
        summaries = list(pool.map(line, lined))
    for summary in summaries:
        out.append({k: summary[k] for k in ("agentId", "status", "limitUsd", "owedUsd", "availableUsd", "collateral")})
    with_lines = {a["agentId"] for a in out}
    out += [r for r in refusals() if r["agentId"] not in with_lines]
    return sorted(out, key=lambda a: a["agentId"])


@app.get("/api/agents/{agent_id}/activity")
def agent_activity(agent_id: int) -> list[dict]:
    return activity(agent_id)


@app.get("/api/agents/{agent_id}")
def agent(agent_id: int) -> dict:
    return line(agent_id)


@app.get("/api/agents/{agent_id}/bureau")
def bureau(agent_id: int) -> list[dict]:
    return bureau_history(agent_id)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "demoControls": bool(DEMO_PASSWORD)}


# Demo controls ----------------------------------------------------------------------------------------

_demo_lock = threading.Lock()
_last_run: dict = {"name": None, "running": False, "output": [], "startedAt": None, "exitCode": None}


def require_demo_password(x_demo_password: str = Header(default="")) -> None:
    if len(DEMO_PASSWORD) < 12:
        raise HTTPException(status_code=503, detail="demo controls are off (set CONSOLE_DEMO_PASSWORD, 12+ characters)")
    if not hmac.compare_digest(x_demo_password.encode(), DEMO_PASSWORD.encode()):
        raise HTTPException(status_code=401, detail="wrong demo password")


def start(name: str, command: list[str], cwd) -> dict:
    if not _demo_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail=f"'{_last_run['name']}' is still running")
    _last_run.update(name=name, running=True, output=[], startedAt=time.time(), exitCode=None)

    def run() -> None:
        try:
            process = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            for output_line in process.stdout:
                if "injected env" not in output_line:
                    _last_run["output"].append(output_line.rstrip())
            _last_run["exitCode"] = process.wait()
        finally:
            _last_run["running"] = False
            _demo_lock.release()

    threading.Thread(target=run, daemon=True).start()
    return {"started": name}


class RushRequest(BaseModel):
    jobs: int = Field(default=8, ge=1, le=12)


@app.post("/api/demo/rush", dependencies=[Depends(require_demo_password)])
def demo_rush(request: RushRequest) -> dict:
    """A rush of paid jobs from the demo customers (real USDC on testnet, $0.02 each)."""
    return start("rush", ["npm", "run", "--silent", "rush", "--", str(request.jobs)], ROOT / "gateway")


@app.post("/api/demo/check-fake-agent", dependencies=[Depends(require_demo_password)])
def demo_check_fake_agent() -> dict:
    """Re-runs the fake-earnings check on the fake agent as a dry run: it traces the money, spends nothing."""
    agent_id, account = required("FAKE_AGENT_CREDIT_ID"), required("HEDERA_FAKE_AGENT_ID")
    python = str(ROOT / "python" / ".venv" / "bin" / "python")
    return start("check-fake-agent", [python, "-m", "overdraft.underwriter", agent_id, account, "--income", account], ROOT / "python")


@app.get("/api/demo/last")
def demo_last() -> dict:
    return _last_run

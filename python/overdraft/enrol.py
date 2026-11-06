"""Enrolment: an owner signs their agent up for credit, then asks for a credit check.

Enrolling, signed by the owner (EIP-712):
1. checks the signer owns the agent's ERC-8004 ID and has let the CreditLine hold their IDs as
   collateral, their account can receive USDC, the agent has no line yet, and its endpoint is a working
   x402 endpoint charging USDC on Hedera testnet;
2. deploys the agent's IncomeSplitter, which pays the owner the rest of each payment, lets it hold USDC
   and binds it to the CreditLine;
3. opens the agent's line with no credit, which registers the splitter on-chain so every service finds
   the agent;
4. publishes the signed application on Arkiv. Its hash is the line's decision hash.

A credit check, also signed by the owner, runs the underwriter on the income the agent can prove is
real. It only runs once the agent's endpoint asks customers to pay its splitter, since that is how its
loans get repaid.

Both run as jobs on one worker thread, one at a time, because they send transactions from the lender's
operator account. A signed request is good for ten minutes and only once, new splitters are capped per
day, and each agent can be checked once every ten minutes.
"""

import json
import queue
import re
import threading
import time
from dataclasses import dataclass, field

import requests
from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3
from web3.exceptions import ContractLogicError

from . import applications, endpoint
from .cli import IDENTITY_ABI, IDENTITY_REGISTRY, ZERO_ADDRESS, deploy_splitter_contract, deployed, prepare_splitter, tx_link, usdc_associated
from .config import ROOT, optional, read_deployments, required
from .hedera import HEDERA_TESTNET_CHAIN_ID, MIRROR, contract_id_of, operator, send, web3
from .solidity import load_abi
from .underwriter import account_or_none, underwrite

SIGNATURE_TTL_SECONDS = 600
CLOCK_SKEW_SECONDS = 60
DAILY_SPLITTERS = int(optional("ENROL_DAILY_CAP") or 20)
CHECK_COOLDOWN_SECONDS = 600
CHECKS_PER_HOUR = 30
MAX_AI_COST_PER_JOB = 1_000_000  # $1, in USDC atomic units (6 decimals)
PUBLISH_ATTEMPTS = 3
STATE_PATH = ROOT / "python" / ".state" / "enrol.json"
NETWORK = "hedera:testnet"

TYPES = {
    "Enrol": [
        {"name": "agentId", "type": "uint256"},
        {"name": "agent", "type": "address"},
        {"name": "zgAccount", "type": "address"},
        {"name": "endpoint", "type": "string"},
        {"name": "incomeAccount", "type": "string"},
        {"name": "aiCostPerJob", "type": "uint256"},
        {"name": "issuedAt", "type": "uint256"},
    ],
    "CreditCheck": [
        {"name": "agentId", "type": "uint256"},
        {"name": "issuedAt", "type": "uint256"},
    ],
}

ENROL_STEPS = [
    ("deployed", "Deploy the agent's income contract"),
    ("associated", "Let it receive USDC"),
    ("bound", "Bind it to the credit line"),
    ("line", "Open the agent's line, with no credit yet"),
    ("published", "Publish the signed application on Arkiv"),
]
CHECK_STEPS = [
    ("endpoint", "Check the endpoint pays the income contract"),
    ("traced", "Trace where each customer's money came from"),
    ("published", "Publish the decision on Arkiv"),
    ("limit", "Set the limit on Hedera"),
]


class EnrolError(Exception):
    """A request that can't go ahead, with the HTTP status that says why."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


# Signed requests ----------------------------------------------------------------------------------------

def domain() -> dict:
    return {"name": "Overdraft", "version": "1", "chainId": HEDERA_TESTNET_CHAIN_ID,
            "verifyingContract": read_deployments()["creditLineEvmAddress"]}


def config() -> dict:
    """What the website needs to build and sign requests the same way this module checks them."""
    return {
        "domain": domain(),
        "types": TYPES,
        "creditLine": read_deployments()["creditLineEvmAddress"],
        "identityRegistry": IDENTITY_REGISTRY,
        "usdc": required("USDC_TOKEN_ID"),
        "network": NETWORK,
        "signatureTtlSeconds": SIGNATURE_TTL_SECONDS,
        "maxAiCostPerJob": MAX_AI_COST_PER_JOB,
        "checkCooldownSeconds": CHECK_COOLDOWN_SECONDS,
        "allowLocalEndpoints": endpoint.allow_local(),
        "enrolSteps": [label for _, label in ENROL_STEPS],
        "checkSteps": [label for _, label in CHECK_STEPS],
    }


def signer_of(primary: str, message: dict, signature: str) -> str:
    """The address that signed a request, once it's shown to be fresh. EnrolError otherwise."""
    issued = int(message["issuedAt"])
    now = time.time()
    if issued > now + CLOCK_SKEW_SECONDS:
        raise EnrolError(400, "the request is dated in the future; check your computer's clock")
    if issued < now - SIGNATURE_TTL_SECONDS:
        raise EnrolError(400, "the signature has expired; sign again")
    if not re.fullmatch(r"0x[0-9a-fA-F]{130}", signature):
        raise EnrolError(400, "that isn't a valid signature")
    try:
        signable = encode_typed_data(domain_data=domain(), message_types={primary: TYPES[primary]}, message_data=message)
        return Account.recover_message(signable, signature=signature)
    except Exception as error:
        raise EnrolError(400, "the signature doesn't match the request") from error


# Local state: used requests, daily counts, cooldowns and half-finished enrolments ------------------------

_state_lock = threading.Lock()


def _load() -> dict:
    state = json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else {}
    for key in ("used", "splitters", "checks", "pending", "unpublished"):
        state.setdefault(key, {})
    state.setdefault("checkTimes", [])
    return state


def _save(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2) + "\n")


def _spend(primary: str, message: dict) -> None:
    """Marks a signed request as used. Keyed by what was signed, so a re-encoded signature can't replay it."""
    key = Web3.keccak(text=primary + json.dumps(message, sort_keys=True)).to_0x_hex()
    now = time.time()
    with _state_lock:
        state = _load()
        state["used"] = {k: expires for k, expires in state["used"].items() if expires > now}
        if key in state["used"]:
            raise EnrolError(409, "this signed request was already used; sign again")
        state["used"][key] = now + SIGNATURE_TTL_SECONDS + CLOCK_SKEW_SECONDS
        _save(state)


def _splitters_today(state: dict) -> int:
    return int(state["splitters"].get(time.strftime("%Y-%m-%d"), 0))


def _count_splitter() -> None:
    with _state_lock:
        state = _load()
        if _splitters_today(state) >= DAILY_SPLITTERS:
            raise EnrolError(429, "today's enrolments are used up; try again tomorrow")
        day = time.strftime("%Y-%m-%d")
        state["splitters"] = {day: _splitters_today(state) + 1}
        _save(state)


def _update(fn) -> None:
    with _state_lock:
        state = _load()
        fn(state)
        _save(state)


# Jobs -----------------------------------------------------------------------------------------------------

@dataclass
class Job:
    kind: str
    agent_id: int
    steps: list[dict]
    state: str = "queued"
    error: str | None = None
    result: dict = field(default_factory=dict)
    updated_at: float = field(default_factory=time.time)

    def mark(self, key: str) -> None:
        for step in self.steps:
            if step["key"] == key:
                step["done"] = True
        self.updated_at = time.time()

    def public(self) -> dict:
        return {"kind": self.kind, "agentId": self.agent_id, "state": self.state, "error": self.error,
                "steps": [{"label": s["label"], "done": s["done"]} for s in self.steps], "result": self.result,
                "updatedAt": self.updated_at}


_jobs: dict[tuple[str, int], Job] = {}
_jobs_lock = threading.Lock()
_queue: queue.Queue = queue.Queue()
_worker: threading.Thread | None = None


def job(kind: str, agent_id: int) -> dict | None:
    with _jobs_lock:
        found = _jobs.get((kind, agent_id))
        return found.public() if found else None


def start_worker() -> None:
    """Starts the job worker if it isn't running. It also retries applications Arkiv didn't take."""
    global _worker
    with _jobs_lock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_run_jobs, name="enrol-worker", daemon=True)
            _worker.start()


def _submit(kind: str, agent_id: int, steps: list[tuple[str, str]], work) -> dict:
    with _jobs_lock:
        current = _jobs.get((kind, agent_id))
        if current and current.state in ("queued", "running"):
            raise EnrolError(409, "this is already in progress")
        new = Job(kind, agent_id, [{"key": key, "label": label, "done": False} for key, label in steps])
        _jobs[(kind, agent_id)] = new
    start_worker()
    _queue.put((new, work))
    return new.public()


def _run_jobs() -> None:
    while True:
        if _queue.empty():
            _publish_backlog()  # quiet moment: retry any application Arkiv didn't take
        try:
            item = _queue.get(timeout=60)
        except queue.Empty:
            continue
        current, work = item
        current.state = "running"
        try:
            current.result = work(current)
            current.state = "done"
        except EnrolError as error:
            current.error, current.state = str(error), "failed"
        except (Exception, SystemExit) as error:  # chain or node trouble: report it, and the owner can try again
            print(f"{time.strftime('%H:%M:%S')} {current.kind} for agent {current.agent_id} failed: {error}", flush=True)
            current.error, current.state = f"something went wrong on-chain: {str(error)[:160]}", "failed"
        current.updated_at = time.time()


# Chain reads ----------------------------------------------------------------------------------------------

_w3 = None
_w3_lock = threading.Lock()


def _hedera():
    global _w3
    with _w3_lock:
        if _w3 is None:
            _w3 = web3()
        return _w3


def _contracts():
    w3 = _hedera()
    credit_line, _ = deployed(w3, "creditLine")
    identity = w3.eth.contract(address=Web3.to_checksum_address(IDENTITY_REGISTRY), abi=IDENTITY_ABI)
    return w3, credit_line, identity


def _mirror_account(account: str) -> dict | None:
    response = requests.get(f"{MIRROR}/accounts/{account}", timeout=20)
    if response.status_code in (400, 404):
        return None
    response.raise_for_status()
    return response.json()


def _usdc_ready(body: dict) -> bool:
    """Whether an account can receive USDC: associated already, or it accepts new tokens automatically."""
    auto = body.get("max_automatic_token_associations") or 0
    return auto == -1 or auto > 0 or usdc_associated(body["account"])


def readiness(owner: str, agent_id: int | None) -> dict:
    """What an owner still needs before enrolling: a funded account that can take USDC, the collateral
    approval, and (for one agent ID) owning it with no line yet."""
    owner = Web3.to_checksum_address(owner)
    _, credit_line, identity = _contracts()
    body = _mirror_account(owner)
    out = {
        "owner": owner,
        "account": body["account"] if body else None,
        "hbar": int(body["balance"]["balance"]) / 100_000_000 if body else 0.0,
        "usdcReady": bool(body) and _usdc_ready(body),
        "collateralApproved": identity.functions.isApprovedForAll(owner, credit_line.address).call(),
    }
    if agent_id is not None:
        try:
            holder = identity.functions.ownerOf(agent_id).call()
        except ContractLogicError:
            holder = None
        status = credit_line.functions.lines(agent_id).call()[-1]
        out.update(agentId=agent_id, exists=holder is not None, ownsId=bool(holder) and holder.lower() == owner.lower(),
                   enrolled=status != 0)
    return out


# Enrolment ------------------------------------------------------------------------------------------------

def _checked_terms(url: str) -> dict:
    """The endpoint's price in USDC on Hedera testnet, or EnrolError saying what's wrong with it."""
    try:
        terms = endpoint.quote(url)
    except ValueError as error:
        raise EnrolError(400, f"the endpoint isn't a working x402 endpoint: {error}") from error
    usdc = required("USDC_TOKEN_ID")
    option = next((a for a in terms["accepts"] if a.get("network") == NETWORK and str(a.get("asset")) == usdc), None)
    if option is None:
        raise EnrolError(400, f"the endpoint must charge USDC ({usdc}) on Hedera testnet, so income can repay loans")
    return {"price": int(option.get("amount") or option.get("maxAmountRequired") or 0), "asset": usdc, "network": NETWORK,
            "payTo": sorted(terms["payTo"])}


def start_enrolment(request: dict) -> dict:
    """Checks a signed enrolment and queues it. Returns the job."""
    message = {t["name"]: request[t["name"]] for t in TYPES["Enrol"]}
    signer = signer_of("Enrol", message, request["signature"])
    agent_id = int(message["agentId"])
    _, credit_line, identity = _contracts()
    if credit_line.functions.lines(agent_id).call()[-1] != 0:
        raise EnrolError(409, "this agent is already enrolled")
    try:
        owner = identity.functions.ownerOf(agent_id).call()
    except ContractLogicError as error:
        raise EnrolError(404, f"agent ID {agent_id} doesn't exist") from error
    if owner.lower() != signer.lower():
        raise EnrolError(403, "only the owner of this agent ID can enrol it")
    if not identity.functions.isApprovedForAll(owner, credit_line.address).call():
        raise EnrolError(400, "first let the credit line hold your agent IDs as collateral")

    owner_body = _mirror_account(owner)
    if not owner_body:
        raise EnrolError(400, "your wallet isn't on Hedera testnet yet: send it free test HBAR from the faucet")
    if not _usdc_ready(owner_body):
        raise EnrolError(400, f"your account {owner_body['account']} can't receive USDC yet: associate token {required('USDC_TOKEN_ID')}")
    agent, zg_account = Web3.to_checksum_address(message["agent"]), Web3.to_checksum_address(message["zgAccount"])
    if ZERO_ADDRESS in (agent.lower(), zg_account.lower()) or credit_line.address in (agent, zg_account):
        raise EnrolError(400, "the agent wallet and 0G account must be real addresses")
    agent_account = account_or_none(agent)
    if message["incomeAccount"] and message["incomeAccount"] not in {owner_body["account"], agent_account}:
        raise EnrolError(400, "past income must have gone to the agent's own Hedera account or to yours")
    if not 0 < int(message["aiCostPerJob"]) <= MAX_AI_COST_PER_JOB:
        raise EnrolError(400, "the AI cost per job must be more than $0 and at most $1")
    terms = _checked_terms(message["endpoint"])
    with _state_lock:
        if _splitters_today(_load()) >= DAILY_SPLITTERS:
            raise EnrolError(429, "today's enrolments are used up; try again tomorrow")

    _spend("Enrol", message)
    application = {
        **message,
        "agent": agent,
        "zgAccount": zg_account,
        "owner": owner,
        "ownerAccount": owner_body["account"],
        "agentAccount": agent_account,
        "signature": request["signature"],
        "terms": terms,
        "creditLine": credit_line.address,
    }
    return _submit("enrol", agent_id, ENROL_STEPS, lambda current: _enrol(current, application))


def _enrol(current: Job, application: dict) -> dict:
    agent_id, owner = int(application["agentId"]), application["owner"]
    w3, account = _hedera(), operator()
    credit_line, _ = deployed(w3, "creditLine")
    pending = _load()["pending"].get(str(agent_id))
    if pending and pending["owner"].lower() == owner.lower():  # an earlier attempt deployed it: finish that one
        splitter = w3.eth.contract(address=pending["evm"], abi=load_abi("IncomeSplitter"))
        splitter_id = pending["id"]
    else:
        _count_splitter()
        splitter, splitter_id = deploy_splitter_contract(w3, account, owner)
        _update(lambda state: state["pending"].update({str(agent_id): {"owner": owner, "evm": splitter.address, "id": splitter_id}}))
    current.mark("deployed")
    prepare_splitter(w3, account, splitter, splitter_id, step=current.mark)

    record = {**application, "splitter": {"id": splitter_id, "evm": splitter.address}, "enrolledAt": int(time.time())}
    fingerprint = applications.fingerprint(record)
    tx = credit_line.functions.setLimit(agent_id, record["agent"], splitter.address, record["zgAccount"], 0,
                                        Web3.to_bytes(hexstr=fingerprint)).build_transaction({"from": account.address, "gas": 400_000})
    line_tx = tx_link(send(w3, account, tx))
    print(f"{time.strftime('%H:%M:%S')} agent {agent_id} enrolled: splitter {splitter_id}, line opened  {line_tx}", flush=True)
    _update(lambda state: state["pending"].pop(str(agent_id), None))
    current.mark("line")

    result = {"splitterId": splitter_id, "splitter": splitter.address, "lineTx": line_tx, "fingerprint": fingerprint, "arkivKey": None}
    try:
        result["arkivKey"] = _publish(record)
        current.mark("published")
    except Exception as error:  # the line is open either way; the worker publishes it when Arkiv answers
        print(f"{time.strftime('%H:%M:%S')} application for agent {agent_id} not published yet: {str(error)[:120]}", flush=True)
        _update(lambda state: state["unpublished"].update({str(agent_id): record}))
        result["warning"] = "The application isn't on Arkiv yet; it is retried automatically"
    return result


def _publish(record: dict) -> str:
    for attempt in range(PUBLISH_ATTEMPTS):
        try:
            return applications.publish(record)["key"]
        except Exception:
            if attempt == PUBLISH_ATTEMPTS - 1:
                raise
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("unreachable")


def _publish_backlog() -> None:
    for agent_id, record in list(_load()["unpublished"].items()):
        try:
            applications.publish(record)
            _update(lambda state: state["unpublished"].pop(agent_id, None))
            print(f"{time.strftime('%H:%M:%S')} application for agent {agent_id} published on Arkiv", flush=True)
        except Exception:
            return  # still busy; next quiet minute


# Credit checks ----------------------------------------------------------------------------------------------

def _pays_splitter(url: str, splitter_id: str) -> None:
    try:
        pay_to = endpoint.quote(url)["payTo"]
    except ValueError as error:
        raise EnrolError(409, f"the agent's endpoint can't be checked: {error}") from error
    if splitter_id not in pay_to:
        raise EnrolError(409, f"the agent's endpoint asks customers to pay {', '.join(sorted(pay_to))}: point its payTo at the "
                              f"income contract {splitter_id}, then check again")


def start_check(agent_id: int, issued_at: int, signature: str) -> dict:
    """Checks a signed credit-check request and queues it. Returns the job."""
    message = {"agentId": agent_id, "issuedAt": issued_at}
    signer = signer_of("CreditCheck", message, signature)
    _, credit_line, identity = _contracts()
    agent, owner, splitter, zg_account, _, _, _, id_locked, status = credit_line.functions.lines(agent_id).call()
    if status == 0:
        raise EnrolError(404, "enrol this agent first")
    if status == 2:
        raise EnrolError(409, "this agent defaulted; its line is closed")
    holder = owner if id_locked else identity.functions.ownerOf(agent_id).call()
    if holder.lower() != signer.lower():
        raise EnrolError(403, "only the owner of this agent ID can ask for a credit check")
    found = applications.latest().get(agent_id)
    if not found:
        raise EnrolError(409, "this agent has no enrolment application on record")
    application = found["record"]
    splitter_id = contract_id_of(splitter)
    _pays_splitter(application["endpoint"], splitter_id)

    now = time.time()
    with _state_lock:
        state = _load()
        waited = now - state["checks"].get(str(agent_id), 0)
        if waited < CHECK_COOLDOWN_SECONDS:
            raise EnrolError(429, f"this agent was checked recently; try again in {int((CHECK_COOLDOWN_SECONDS - waited) / 60) + 1} min")
        recent = [t for t in state["checkTimes"] if now - t < 3600]
        if len(recent) >= CHECKS_PER_HOUR:
            raise EnrolError(429, "too many credit checks this hour; try again shortly")
    _spend("CreditCheck", message)

    def remember(state: dict) -> None:
        state["checks"][str(agent_id)] = now
        state["checkTimes"] = [t for t in state["checkTimes"] if now - t < 3600] + [now]

    _update(remember)
    line = {"agent": agent, "splitter": splitter, "splitterId": splitter_id, "zgAccount": zg_account}
    return _submit("check", agent_id, CHECK_STEPS, lambda current: _check(current, application, line))


def _check(current: Job, application: dict, line: dict) -> dict:
    _pays_splitter(application["endpoint"], line["splitterId"])
    current.mark("endpoint")
    income = [line["splitterId"]] + ([application["incomeAccount"]] if application["incomeAccount"] else [])
    outcome = underwrite(current.agent_id, line["agent"], income, None, line["zgAccount"], int(application["aiCostPerJob"]) / 1_000_000,
                         True, splitter=(line["splitter"], line["splitterId"]), step=current.mark)
    facts = outcome["record"]["facts"]
    return {
        "approved": facts["approved"],
        "limitUsd": facts["limit"] / 1_000_000,
        "reasons": facts["reasons"],
        "independentCustomers": facts["independentCustomers"],
        "minIndependentCustomers": facts["rules"]["minIndependentCustomers"],
        "verifiedIncomeUsd": facts["verifiedIncome"] / 1_000_000,
        "receivedUsd": facts["received"] / 1_000_000,
        "decisionHash": outcome["decisionHash"],
        "arkivKey": (outcome["entity"] or {}).get("key"),
        "limitTx": outcome["limitTx"],
    }

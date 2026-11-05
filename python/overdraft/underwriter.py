"""Underwriter: sets an agent's credit limit from income it can prove is real.

Earnings can be faked: an owner can fund a few wallets and have them "pay" the agent. So before
counting a customer's payments, the underwriter traces where that customer's money came from, using
Hedera's public mirror node, up to three hops back. Payments funded by the agent or its owner count
for nothing, and so does money the agent sent out that came back as payment. No single customer can
count for more than 40% of income, at least three independent customers are needed, and each job
must earn more than its AI compute costs.

The decision (every fact it used, plus a short memo) is written to Arkiv, and its hash goes on-chain
with the limit, so anyone can check that the limit matches the published reasoning.

    python -m overdraft.underwriter AGENT_ID AGENT_ACCOUNT [--income 0.0.X ...] [--splitter main] [--apply]

The money trail shows who funded whom; it can't see through an exchange or an intermediary more than
three hops away. It raises the cost of faking income rather than making it impossible, which is why
new agents also start with small limits.
"""

import argparse
import json
import math
import time
from dataclasses import dataclass, field

import requests
from web3 import Web3

from . import arkiv
from .arkiv import Attr
from .cli import IDENTITY_ABI, IDENTITY_REGISTRY, deployed, splitter_address, tx_link
from .config import optional, read_deployments, required
from .hedera import MIRROR, evm_address_of, format_usdc, operator, send, web3

WINDOW_DAYS = 30
TRACE_HOPS = 3
CONCENTRATION_CAP = 0.40       # no customer counts for more than 40% of verified income
MIN_INDEPENDENT_CUSTOMERS = 3
MIN_MARGIN = 0.20              # each job must earn at least 20% more than its AI cost
LIMIT_SHARE = 0.50             # limit = half of the income that counts
MAX_NEW_AGENT_LIMIT = 5_000_000  # $5: a new agent ID is free, so limits start small
MIN_LIMIT = 10_000             # $0.01
HISTORY_PAGES = 3              # transactions read per account when tracing (100 per page)
RECORD_LIFETIME_BLOCKS = 90 * arkiv.BLOCKS_PER_DAY

_session = requests.Session()
_history_cache: dict[str, list[dict]] = {}


@dataclass
class Customer:
    account: str
    paid: int = 0
    jobs: int = 0
    first_paid_at: str = ""
    verdict: str = "independent"
    path: list[str] = field(default_factory=list)
    funded_by: list[str] = field(default_factory=list)


def mirror(path: str) -> dict:
    for attempt in range(4):
        response = _session.get(f"{MIRROR.rsplit('/api/v1', 1)[0]}{path}", timeout=30)
        if response.status_code == 429:  # rate limited: back off and retry
            time.sleep(1 + attempt)
            continue
        response.raise_for_status()
        return response.json()
    raise RuntimeError(f"Mirror node kept rate-limiting {path}")


def account_id_of(evm_address: str) -> str:
    return mirror(f"/api/v1/accounts/{evm_address}")["account"]


def is_system(account: str) -> bool:
    """Node, fee and staking accounts (0.0.1 to 0.0.1000) appear in every transaction; they fund nobody."""
    return int(account.split(".")[2]) <= 1000


def history(account: str, pages: int = HISTORY_PAGES) -> list[dict]:
    """An account's earliest transactions, oldest first (works for contracts too)."""
    if account not in _history_cache:
        created = mirror(f"/api/v1/accounts/{account}")["created_timestamp"]
        path = f"/api/v1/accounts/{account}?order=asc&limit=100&timestamp=gte:{created}"
        txs: list[dict] = []
        for _ in range(pages):
            body = mirror(path)
            txs.extend(t for t in body.get("transactions", []) if t["result"] == "SUCCESS")
            path = (body.get("links") or {}).get("next")
            if not path:
                break
        _history_cache[account] = txs
    return _history_cache[account]


def funders(account: str, before: str) -> dict[str, str]:
    """Who sent this account HBAR or tokens before a time: {funder: latest funding timestamp}."""
    out: dict[str, str] = {}
    for tx in history(account):
        ts = tx["consensus_timestamp"]
        if ts >= before:
            break
        for transfers in (tx["transfers"], tx["token_transfers"]):
            assets = {t.get("token_id", "HBAR") for t in transfers}
            for asset in assets:
                moves = [t for t in transfers if t.get("token_id", "HBAR") == asset]
                if not any(t["account"] == account and t["amount"] > 0 for t in moves):
                    continue
                for t in moves:
                    if t["amount"] < 0 and t["account"] != account and not is_system(t["account"]):
                        out[t["account"]] = max(out.get(t["account"], ""), ts)
    return out


def trace(customer: str, paid_at: str, cluster: set[str], stop: set[str]) -> tuple[list[str] | None, list[str]]:
    """Follows the money back from a customer. Returns (path to the agent's side if found, first-hop funders)."""
    first_hop = sorted(funders(customer, paid_at))
    frontier = [(customer, paid_at, [customer])]
    seen = {customer}
    for _ in range(TRACE_HOPS):
        next_frontier = []
        for account, before, path in frontier:
            for funder, funded_at in sorted(funders(account, before).items()):
                if funder in cluster:
                    return path + [funder], first_hop
                if funder in seen or funder in stop:
                    continue  # the lender's own wallets are outside money; don't follow them further
                seen.add(funder)
                next_frontier.append((funder, funded_at, path + [funder]))
        frontier = next_frontier
    return None, first_hop


def payments_into(income_accounts: list[str], since: str, usdc: str) -> list[tuple[str, int, str]]:
    """(payer, amount, timestamp) for every USDC payment into the agent's income accounts since a time."""
    out = []
    for income in income_accounts:
        path = f"/api/v1/accounts/{income}?order=asc&limit=100&timestamp=gte:{since}"
        while path:
            body = mirror(path)
            for tx in body.get("transactions", []):
                if tx["result"] != "SUCCESS":
                    continue
                moves = [t for t in tx["token_transfers"] if t["token_id"] == usdc]
                received = sum(t["amount"] for t in moves if t["account"] == income)
                if received <= 0:
                    continue
                for t in moves:
                    if t["amount"] < 0 and t["account"] not in income_accounts:
                        out.append((t["account"], -t["amount"], tx["consensus_timestamp"]))
            path = (body.get("links") or {}).get("next")
    return out


def assess(agent_id: int, agent_account: str, owner_account: str, income_accounts: list[str], cost_per_job: int) -> dict:
    """Builds the decision from on-chain facts only. Amounts are USDC atomic units (6 decimals)."""
    usdc = required("USDC_TOKEN_ID")
    now = time.time()
    since = f"{now - WINDOW_DAYS * 86_400:.9f}"
    lender = {required("HEDERA_OPERATOR_ID")} | {a for a in (optional("POOL_ACCOUNT_ID"), optional("COMPUTE_BUCKET_ACCOUNT_ID")) if a}
    splitters = {d["splitterContractId"] for d in [read_deployments()] if d.get("splitterContractId")}
    splitters |= {s["contractId"] for s in read_deployments().get("splitters", {}).values()}
    # The agent's side: its owner, the agent itself, and any income account that is a plain wallet it controls.
    cluster = {owner_account, agent_account} | {a for a in income_accounts if a not in splitters}

    customers: dict[str, Customer] = {}
    lender_transfers = 0
    for payer, amount, ts in payments_into(income_accounts, since, usdc):
        if payer in lender:
            lender_transfers += amount  # test funding from the lender, not a customer
            continue
        c = customers.setdefault(payer, Customer(payer, first_paid_at=ts))
        c.paid += amount
        c.jobs += 1
        c.first_paid_at = min(c.first_paid_at, ts)

    for c in customers.values():
        if c.account in cluster:
            c.verdict, c.path = "self-payment", [c.account]
            continue
        # Trace from the last payment, so money received before any of the payments is considered.
        path, c.funded_by = trace(c.account, f"{now:.9f}", cluster, lender)
        if path:
            c.path = path
            c.verdict = "round-trip" if path[-1] != owner_account else "owner-funded"

    independent = [c for c in customers.values() if c.verdict == "independent"]
    flagged = [c for c in customers.values() if c.verdict != "independent"]
    verified = sum(c.paid for c in independent)
    received = sum(c.paid for c in customers.values())
    cap = math.floor(verified * CONCENTRATION_CAP)
    counted = sum(min(c.paid, cap) for c in independent)
    jobs = sum(c.jobs for c in independent)
    price_per_job = verified // jobs if jobs else 0
    margin = (price_per_job - cost_per_job) / price_per_job if price_per_job else 0.0
    limit = min(MAX_NEW_AGENT_LIMIT, math.floor(counted * LIMIT_SHARE / 10_000) * 10_000)

    reasons = []
    if len(independent) < MIN_INDEPENDENT_CUSTOMERS:
        reasons.append(f"only {len(independent)} independent customer(s); at least {MIN_INDEPENDENT_CUSTOMERS} are needed")
    if flagged:
        share = 1 - verified / received if received else 0
        reasons.append(f"{len(flagged)} customer(s) paid with money that traces back to the agent or its owner "
                       f"({format_usdc(received - verified)}, {share:.0%} of income); it counts for nothing")
    if independent and margin < MIN_MARGIN:
        reasons.append(f"each job earns {format_usdc(price_per_job)} but costs {format_usdc(cost_per_job)} in AI compute "
                       f"(margin {margin:.0%}, at least {MIN_MARGIN:.0%} needed)")
    approved = len(independent) >= MIN_INDEPENDENT_CUSTOMERS and margin >= MIN_MARGIN and limit >= MIN_LIMIT
    if not approved and not reasons:
        reasons.append("the income that counts is too small for a limit")

    return {
        "schema": "overdraft.underwriting.v1",
        "agentId": agent_id,
        "agentAccount": agent_account,
        "owner": owner_account,
        "incomeAccounts": income_accounts,
        "window": {"days": WINDOW_DAYS, "from": since, "to": f"{now:.9f}"},
        "rules": {"traceHops": TRACE_HOPS, "concentrationCap": CONCENTRATION_CAP, "minIndependentCustomers": MIN_INDEPENDENT_CUSTOMERS,
                  "minMargin": MIN_MARGIN, "limitShare": LIMIT_SHARE, "maxNewAgentLimit": MAX_NEW_AGENT_LIMIT},
        "customers": [
            {"account": c.account, "paid": c.paid, "jobs": c.jobs, "verdict": c.verdict, "path": c.path, "fundedBy": c.funded_by}
            for c in sorted(customers.values(), key=lambda c: -c.paid)
        ],
        "lenderTransfersIgnored": lender_transfers,
        "received": received,
        "verifiedIncome": verified,
        "countedIncome": counted,
        "independentCustomers": len(independent),
        "pricePerJob": price_per_job,
        "costPerJob": cost_per_job,
        "margin": round(margin, 4),
        "approved": approved,
        "limit": limit if approved else 0,
        "reasons": reasons,
    }


def template_memo(facts: dict) -> str:
    agent = facts["agentId"]
    if facts["approved"]:
        return (
            f"Approved a limit of {format_usdc(facts['limit'])} for agent {agent}. In the last {facts['window']['days']} days it earned "
            f"{format_usdc(facts['verifiedIncome'])} from {facts['independentCustomers']} independent customers. No customer's money "
            f"traced back to the agent or its owner within {facts['rules']['traceHops']} hops, and no customer counts for more than "
            f"{facts['rules']['concentrationCap']:.0%} of income. Each job earns {format_usdc(facts['pricePerJob'])} and costs about "
            f"{format_usdc(facts['costPerJob'])} in AI compute, a {facts['margin']:.0%} margin. The limit is "
            f"{facts['rules']['limitShare']:.0%} of the income that counts, capped at {format_usdc(facts['rules']['maxNewAgentLimit'])}."
        )
    lines = [f"Refused credit for agent {agent}: " + "; ".join(facts["reasons"]) + "."]
    for c in facts["customers"]:
        if c["verdict"] == "self-payment":
            lines.append(f"{c['account']} is the agent's own side paying itself.")
        elif c["verdict"] != "independent":
            hops = len(c["path"]) - 1
            via = f" via {', '.join(c['path'][1:-1])}" if hops > 1 else ""
            source = "the agent's owner" if c["verdict"] == "owner-funded" else "the agent itself"
            lines.append(f"{c['account']} was funded by {source}{via} ({hops} hop{'s' if hops > 1 else ''}).")
    return " ".join(lines)


def write_memo(facts: dict) -> tuple[str, str]:
    """(memo, author). The decision is made by the rules above; a model only puts it into words."""
    api_key = optional("ZG_UNDERWRITER_API_KEY")
    if api_key:
        from . import zg

        prompt = ("Write a credit memo of at most four sentences for a lender, in plain English, from these facts. Amounts are "
                  "USDC with 6 decimals. Use only these facts and do not change any number or the decision.\n" + json.dumps(facts))
        try:
            result = zg.chat(api_key, optional("ZG_MODEL") or "qwen3.5-flash", [{"role": "user", "content": prompt}])
            return result["text"].strip(), f"0G {result['model']} ({result['request_id']})"
        except Exception as error:  # the template is always available
            print(f"0G memo unavailable ({str(error)[:100]}); using the template")
    return template_memo(facts), "template"


def canonical(record: dict) -> bytes:
    return json.dumps(record, sort_keys=True, separators=(",", ":")).encode()


def publish(record: dict, decision_hash: str) -> dict:
    facts = record["facts"]
    attrs = [
        Attr("arkiv.schema", "str", "overdraft.bureau"),
        Attr("kind", "str", "underwriting" if facts["approved"] else "refusal"),
        Attr("agentId", "u64", facts["agentId"]),
        Attr("limit", "u64", facts["limit"]),
        Attr("decisionHash", "str", decision_hash),
        Attr("record", "bytes", canonical(record), indexed=False),
    ]
    return arkiv.create_entity(attrs, RECORD_LIFETIME_BLOCKS)


def underwrite(agent_id: int, agent_account: str, income: list[str] | None, splitter_name: str,
               zg_account: str | None, cost_per_job_usd: float, apply: bool) -> dict:
    w3 = web3()
    identity = w3.eth.contract(address=Web3.to_checksum_address(IDENTITY_REGISTRY), abi=IDENTITY_ABI)
    owner_account = account_id_of(identity.functions.ownerOf(agent_id).call())
    credit_line, _ = deployed(w3, "creditLine")
    line = credit_line.functions.lines(agent_id).call()
    if line[-1] == 1 and line[7]:  # while the ID is locked as collateral, ownerOf is the CreditLine
        owner_account = account_id_of(line[1])
    if not income:
        income = [splitter_address(splitter_name)[1]]

    print(f"Underwriting agent {agent_id} (agent {agent_account}, owner {owner_account}); income into {', '.join(income)}")
    facts = assess(agent_id, agent_account, owner_account, income, round(cost_per_job_usd * 1_000_000))
    for c in facts["customers"]:
        trail = " <- ".join(c["path"]) if c["path"] else f"funded by {', '.join(c['fundedBy']) or 'nobody found'}"
        print(f"  {c['account']:<14} paid {format_usdc(c['paid'])} over {c['jobs']} job(s): {c['verdict']} ({trail})")
    if facts["lenderTransfersIgnored"]:
        print(f"  ignored {format_usdc(facts['lenderTransfersIgnored'])} of test transfers from the lender")
    memo, author = write_memo(facts)
    record = {"facts": facts, "memo": memo, "memoAuthor": author}
    decision_hash = Web3.keccak(canonical(record)).to_0x_hex()
    verdict = f"APPROVED, limit {format_usdc(facts['limit'])}" if facts["approved"] else "REFUSED"
    print(f"{verdict}. Verified {format_usdc(facts['verifiedIncome'])} of {format_usdc(facts['received'])}, "
          f"counted {format_usdc(facts['countedIncome'])}, {facts['independentCustomers']} independent customer(s)")
    print(f"Memo ({author}): {memo}")
    print(f"Decision hash {decision_hash}")
    if not apply:
        print("Dry run: add --apply to publish the decision and set the limit.")
        return record

    entity = publish(record, decision_hash)
    print(f"Decision published on Arkiv: entity {entity['key']}  https://rabdi.explorer.arkiv.network/tx/{entity['txHash']}")
    has_line = line[-1] == 1
    if facts["approved"] or has_line:  # a refusal on an existing line sets its limit to zero
        account = operator()
        splitter, _ = splitter_address(splitter_name)
        zg = Web3.to_checksum_address(zg_account or (line[3] if has_line else None) or optional("ZG_AGENT_ADDRESS") or evm_address_of(agent_account))
        tx = credit_line.functions.setLimit(agent_id, evm_address_of(agent_account), splitter, zg, facts["limit"],
                                            Web3.to_bytes(hexstr=decision_hash)).build_transaction({"from": account.address, "gas": 400_000})
        print(f"setLimit({agent_id}, {format_usdc(facts['limit'])}) with the decision hash  {tx_link(send(w3, account, tx))}")
    return record


def main() -> None:
    parser = argparse.ArgumentParser(description="Set an agent's credit limit from income it can prove is real.")
    parser.add_argument("agent_id", type=int, help="the agent's ERC-8004 ID")
    parser.add_argument("agent_account", help="the agent's Hedera account ID")
    parser.add_argument("--income", action="append", help="an account the agent's customers pay (repeatable); defaults to its splitter")
    parser.add_argument("--splitter", default="main", help="the splitter the credit line will use")
    parser.add_argument("--zg-account", help="the agent's 0G compute account")
    parser.add_argument("--cost-per-job", type=float, default=float(optional("AGENT_AI_COST_USD") or 0.01),
                        help="the agent's AI cost per job in USD")
    parser.add_argument("--apply", action="store_true", help="publish the decision on Arkiv and set the limit on Hedera")
    a = parser.parse_args()
    underwrite(a.agent_id, a.agent_account, a.income, a.splitter, a.zg_account, a.cost_per_job, a.apply)


if __name__ == "__main__":
    main()

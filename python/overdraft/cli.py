"""Overdraft command line (Hedera testnet).

    python -m overdraft.cli deploy-credit-line                       # CreditLine secured by ERC-8004 IDs
    python -m overdraft.cli deploy-splitter [--name main]            # an agent's IncomeSplitter, bound to the CreditLine
    python -m overdraft.cli register-agent [--owner OWNER]           # owner mints the agent's ERC-8004 ID and approves the CreditLine
    python -m overdraft.cli approve-collateral [--owner OWNER]       # one-time permission to hold the owner's IDs while they owe
    python -m overdraft.cli set-limit AGENT_ID AGENT_ACCOUNT LIMIT_USDC [--splitter main] [--zg-account 0x...]
    python -m overdraft.cli request-draw AGENT_ID AMOUNT_USDC [--agent AGENT]
    python -m overdraft.cli release-id AGENT_ID                      # return the ID once the debt is repaid
    python -m overdraft.cli flag-breach AGENT_ID REASON              # watcher: defaults a line with debt outstanding
    python -m overdraft.cli mark-overdue AGENT_ID                    # anyone, after the due date plus grace
    python -m overdraft.cli credit-status AGENT_ID
    python -m overdraft.cli splitter-balance | sweep
    python -m overdraft.cli send-usdc ACCOUNT AMOUNT_USDC [--from NAME]
"""

import argparse
import time

import requests
from eth_account import Account
from web3 import Web3
from web3.logs import DISCARD

from .config import optional, read_deployments, required, write_deployments
from .hedera import (
    MIRROR,
    contract_id_of,
    evm_address_of,
    format_usdc,
    hashscan_contract,
    hashscan_tx,
    long_zero_address,
    operator,
    send,
    token_balance,
    web3,
)
from .solidity import compile_contract, load_abi

LENDER_BPS = 3_000
COMPUTE_BPS = 2_000
FEE_BPS = 500
IDENTITY_REGISTRY = optional("ERC8004_IDENTITY_REGISTRY") or "0x8004A818BFB912233c491871b3d84c89A494BD9e"
STATUS = {0: "none", 1: "active", 2: "defaulted"}
ZERO_ADDRESS = "0x" + "0" * 40

ERC20_ABI = [
    {"name": "transfer", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}], "outputs": [{"name": "", "type": "bool"}]},
]
IDENTITY_ABI = [
    {"name": "register", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "agentURI", "type": "string"}], "outputs": [{"name": "agentId", "type": "uint256"}]},
    {"name": "approve", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "to", "type": "address"}, {"name": "tokenId", "type": "uint256"}], "outputs": []},
    {"name": "setApprovalForAll", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "operator", "type": "address"}, {"name": "approved", "type": "bool"}], "outputs": []},
    {"name": "isApprovedForAll", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "owner", "type": "address"}, {"name": "operator", "type": "address"}], "outputs": [{"name": "", "type": "bool"}]},
    {"name": "getApproved", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "tokenId", "type": "uint256"}], "outputs": [{"name": "", "type": "address"}]},
    {"name": "ownerOf", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "tokenId", "type": "uint256"}], "outputs": [{"name": "", "type": "address"}]},
    {"name": "Transfer", "type": "event", "anonymous": False, "inputs": [
        {"name": "from", "type": "address", "indexed": True}, {"name": "to", "type": "address", "indexed": True},
        {"name": "tokenId", "type": "uint256", "indexed": True}]},
]


def usdc_atomic(amount: str) -> int:
    return round(float(amount) * 1_000_000)


def tx_link(receipt) -> str:
    return hashscan_tx(receipt["transactionHash"].to_0x_hex())


def hedera_account(name: str) -> tuple[str, Account]:
    """(account ID, signer) for HEDERA_<NAME>_ID / HEDERA_<NAME>_KEY."""
    name = name.upper()
    return required(f"HEDERA_{name}_ID"), Account.from_key(required(f"HEDERA_{name}_KEY"))


def deployed(w3, name: str):
    """Returns (contract, deployments) for 'creditLine' or 'splitter' (the main agent's splitter)."""
    deployments = read_deployments()
    address = deployments.get(f"{name}EvmAddress")
    if not address:
        raise SystemExit(f"No {name} deployed yet.")
    abi_name = {"splitter": "IncomeSplitter", "creditLine": "CreditLine"}[name]
    return w3.eth.contract(address=address, abi=load_abi(abi_name)), deployments


def splitter_address(name: str) -> tuple[str, str]:
    """(EVM address, contract ID) of a named splitter; 'main' is the one the x402 gateway pays."""
    deployments = read_deployments()
    if name == "main":
        return deployments["splitterEvmAddress"], deployments["splitterContractId"]
    entry = deployments.get("splitters", {}).get(name)
    if not entry:
        raise SystemExit(f"No splitter named '{name}'. Run: deploy-splitter --name {name}")
    return entry["evmAddress"], entry["contractId"]


_compiled: dict[tuple[str, str], tuple[list, str]] = {}


def deploy(w3, account, file_name: str, contract_name: str, args: tuple, gas: int):
    if (file_name, contract_name) not in _compiled:  # compiling takes seconds; the sources don't change while running
        _compiled[(file_name, contract_name)] = compile_contract(file_name, contract_name)
    abi, bytecode = _compiled[(file_name, contract_name)]
    factory = w3.eth.contract(abi=abi, bytecode=bytecode)
    receipt = send(w3, account, factory.constructor(*args).build_transaction({"from": account.address, "gas": gas}))
    address = receipt["contractAddress"]
    contract_id = contract_id_of(address)
    print(f"{contract_name} deployed: {contract_id} ({address})  {tx_link(receipt)}", flush=True)
    return w3.eth.contract(address=address, abi=abi), contract_id


def deploy_credit_line() -> None:
    w3, account = web3(), operator()
    term = int(optional("CREDIT_TERM_SECONDS") or 7 * 24 * 3600)
    grace = int(optional("CREDIT_GRACE_SECONDS") or 24 * 3600)
    args = (Web3.to_checksum_address(IDENTITY_REGISTRY), account.address, FEE_BPS, term, grace,
            account.address, account.address, account.address)
    contract, contract_id = deploy(w3, account, "CreditLine.sol", "CreditLine", args, 3_000_000)
    write_deployments({"creditLineContractId": contract_id, "creditLineEvmAddress": contract.address})
    print(f"Fee {FEE_BPS / 100}%, term {term}s, grace {grace}s, ID registry {IDENTITY_REGISTRY}. "
          "Deploy a new splitter next: a splitter binds to one credit line, once.")


def payout_address(env_name: str, fallback: str) -> str:
    """The EVM address of the account named in env_name, or the fallback."""
    account_id = optional(env_name)
    return evm_address_of(account_id) if account_id else fallback


def deploy_splitter_contract(w3, account, owner: str):
    """Deploys an agent's IncomeSplitter that pays `owner` the rest of each payment. Returns (contract, contract ID)."""
    usdc = long_zero_address(required("USDC_TOKEN_ID"))
    args = (usdc, Web3.to_checksum_address(owner), payout_address("POOL_ACCOUNT_ID", account.address),
            payout_address("COMPUTE_BUCKET_ACCOUNT_ID", account.address), LENDER_BPS, COMPUTE_BPS)
    return deploy(w3, account, "IncomeSplitter.sol", "IncomeSplitter", args, 1_500_000)


def prepare_splitter(w3, account, splitter, contract_id: str, step=lambda key: None) -> None:
    """Lets a splitter hold USDC and binds it to the CreditLine, skipping whatever is already done.
    `step` is told "associated" and then "bound"."""
    credit_line = read_deployments().get("creditLineEvmAddress")
    if not credit_line:
        raise SystemExit("Deploy the credit line first: deploy-credit-line")
    if not usdc_associated(contract_id):
        receipt = send(w3, account, splitter.functions.associateUsdc().build_transaction({"from": account.address, "gas": 1_000_000}))
        print(f"associateUsdc(): ok  {tx_link(receipt)}", flush=True)
    step("associated")
    bound = splitter.functions.creditLine().call()
    if bound == ZERO_ADDRESS:
        receipt = send(w3, account, splitter.functions.bindCreditLine(credit_line).build_transaction({"from": account.address, "gas": 100_000}))
        print(f"bindCreditLine(): ok  {tx_link(receipt)}", flush=True)
    elif bound.lower() != credit_line.lower():
        raise RuntimeError(f"splitter {contract_id} is bound to another credit line ({bound})")
    step("bound")


def usdc_associated(entity_id: str) -> bool:
    """Whether an account or contract can hold USDC (it has associated the token)."""
    body = requests.get(f"{MIRROR}/accounts/{entity_id}/tokens?token.id={required('USDC_TOKEN_ID')}", timeout=20)
    body.raise_for_status()
    return bool(body.json().get("tokens"))


def deploy_splitter(name: str) -> None:
    w3, account = web3(), operator()
    owner = payout_address("OWNER_ACCOUNT_ID", evm_address_of(optional("HEDERA_OWNER_ID")) if optional("HEDERA_OWNER_ID") else account.address)
    splitter, contract_id = deploy_splitter_contract(w3, account, owner)
    prepare_splitter(w3, account, splitter, contract_id)
    if name == "main":
        write_deployments({"splitterContractId": contract_id, "splitterEvmAddress": splitter.address})
    else:
        splitters = read_deployments().get("splitters", {})
        splitters[name] = {"contractId": contract_id, "evmAddress": splitter.address}
        write_deployments({"splitters": splitters})
    print(f"Splitter '{name}': payTo {contract_id}, owner payout {owner}  {hashscan_contract(contract_id)}")


def register_agent(owner_name: str, uri: str) -> int:
    """The owner mints the agent's ERC-8004 ID and approves the CreditLine to hold it while the agent owes."""
    w3 = web3()
    _, owner = hedera_account(owner_name)
    credit_line, _ = deployed(w3, "creditLine")
    identity = w3.eth.contract(address=Web3.to_checksum_address(IDENTITY_REGISTRY), abi=IDENTITY_ABI)
    receipt = send(w3, owner, identity.functions.register(uri).build_transaction({"from": owner.address, "gas": 600_000}))
    minted = [e for e in identity.events.Transfer().process_receipt(receipt, errors=DISCARD) if e["args"]["from"] == ZERO_ADDRESS]
    if not minted:
        raise SystemExit("No ERC-8004 ID minted")
    agent_id = minted[0]["args"]["tokenId"]
    print(f"ERC-8004 agent ID {agent_id} minted to {owner.address}  {tx_link(receipt)}")
    approve_collateral(owner_name)
    return agent_id


def approve_collateral(owner_name: str) -> None:
    """One-time permission for the CreditLine to hold the owner's agent IDs while they owe money.

    An operator approval (setApprovalForAll) survives the ID moving into escrow and back; a per-token
    approval is cleared by every transfer, so the owner would have to re-approve after each repayment.
    """
    w3 = web3()
    _, owner = hedera_account(owner_name)
    credit_line, _ = deployed(w3, "creditLine")
    identity = w3.eth.contract(address=Web3.to_checksum_address(IDENTITY_REGISTRY), abi=IDENTITY_ABI)
    if identity.functions.isApprovedForAll(owner.address, credit_line.address).call():
        print("The CreditLine is already approved to hold this owner's agent IDs as collateral")
        return
    tx = identity.functions.setApprovalForAll(credit_line.address, True).build_transaction({"from": owner.address, "gas": 100_000})
    print(f"setApprovalForAll(CreditLine): IDs can be held as collateral while their agents owe  {tx_link(send(w3, owner, tx))}")


def set_limit(agent_id: int, agent_account: str, limit: str, splitter_name: str, zg_account: str | None) -> None:
    w3, account = web3(), operator()
    credit_line, _ = deployed(w3, "creditLine")
    agent = evm_address_of(agent_account)
    splitter, _ = splitter_address(splitter_name)
    zg = Web3.to_checksum_address(zg_account or optional("ZG_AGENT_ADDRESS") or agent)
    decision_hash = Web3.keccak(text=f"limit {agent_id} {limit} USDC")
    tx = credit_line.functions.setLimit(agent_id, agent, splitter, zg, usdc_atomic(limit), decision_hash).build_transaction(
        {"from": account.address, "gas": 400_000}
    )
    print(f"setLimit(agent {agent_id}, {limit} USDC, splitter '{splitter_name}', 0G {zg}): ok  {tx_link(send(w3, account, tx))}")


def request_draw(agent_id: int, amount: str, agent_name: str) -> None:
    w3 = web3()
    _, agent = hedera_account(agent_name)
    credit_line, _ = deployed(w3, "creditLine")
    tx = credit_line.functions.requestDraw(agent_id, usdc_atomic(amount)).build_transaction({"from": agent.address, "gas": 500_000})
    receipt = send(w3, agent, tx)
    for event in credit_line.events.IdLocked().process_receipt(receipt, errors=DISCARD):
        print(f"Agent ID {event['args']['agentId']} locked as collateral")
    for event in credit_line.events.DrawRequested().process_receipt(receipt, errors=DISCARD):
        a = event["args"]
        print(f"Loan #{a['drawId']}: {format_usdc(a['amount'])} to 0G account {a['zgAccount']}; owed now {format_usdc(a['owedAfter'])}, "
              f"due {time.strftime('%Y-%m-%d %H:%M', time.localtime(a['dueAt']))}  {tx_link(receipt)}")


def operator_call(function_name: str, *args) -> None:
    w3, account = web3(), operator()
    credit_line, _ = deployed(w3, "creditLine")
    tx = getattr(credit_line.functions, function_name)(*args).build_transaction({"from": account.address, "gas": 400_000})
    print(f"{function_name}{args}: ok  {tx_link(send(w3, account, tx))}")


def credit_status(agent_id: int) -> None:
    w3 = web3()
    credit_line, _ = deployed(w3, "creditLine")
    agent, owner, splitter, zg_account, limit, _, due_at, id_locked, status = credit_line.functions.lines(agent_id).call()
    if status == 0:
        raise SystemExit(f"No line for agent {agent_id}")
    owed = credit_line.functions.owedOf(agent_id).call()
    available = credit_line.functions.availableOf(agent_id).call()
    identity = w3.eth.contract(address=Web3.to_checksum_address(IDENTITY_REGISTRY), abi=IDENTITY_ABI)
    holder = identity.functions.ownerOf(agent_id).call()
    who = {credit_line.address: "the CreditLine (collateral)", owner: "its owner"}.get(holder, holder)
    print(f"Agent {agent_id}: {STATUS[status]}; agent {agent}; owner {owner}; splitter {splitter}; 0G account {zg_account}")
    print(f"  limit {format_usdc(limit)}, owed {format_usdc(owed)}, available {format_usdc(available)}"
          + (f", due {time.strftime('%Y-%m-%d %H:%M', time.localtime(due_at))}" if due_at else ""))
    print(f"  ID held by {who}" + (" (locked)" if id_locked else ""))
    for draw_id in range(credit_line.functions.drawCount().call()):
        draw_agent, amount, zg_tx = credit_line.functions.draws(draw_id).call()
        if draw_agent == agent_id:
            print(f"  loan #{draw_id}: {format_usdc(amount)}, " + (f"0G tx 0x{zg_tx.hex()}" if any(zg_tx) else "awaiting 0G deposit"))


def splitter_balance(name: str) -> None:
    w3 = web3()
    address, contract_id = splitter_address(name)
    splitter = w3.eth.contract(address=address, abi=load_abi("IncomeSplitter"))
    print(f"Splitter '{name}' {contract_id} holds {format_usdc(token_balance(contract_id, required('USDC_TOKEN_ID')))}; "
          f"owed to pool {format_usdc(splitter.functions.owed().call())}")


def sweep(name: str) -> None:
    w3, account = web3(), operator()
    address, _ = splitter_address(name)
    splitter = w3.eth.contract(address=address, abi=load_abi("IncomeSplitter"))
    receipt = send(w3, account, splitter.functions.sweep().build_transaction({"from": account.address, "gas": 500_000}))
    for event in splitter.events.Swept().process_receipt(receipt, errors=DISCARD):
        a = event["args"]
        print(f"sweep(): {format_usdc(a['total'])} -> lender {format_usdc(a['toPool'])}, compute {format_usdc(a['toCompute'])}, "
              f"owner {format_usdc(a['toOwner'])}; owed now {format_usdc(a['owedAfter'])}  {tx_link(receipt)}")


def send_usdc(to: str, amount: str, sender: str = "OPERATOR", wait: bool = True) -> None:
    """Sends USDC from a HEDERA_<NAME> account to a Hedera account or contract (through the token's ERC-20 facade)."""
    w3 = web3()
    _, account = hedera_account(sender)
    usdc_id = required("USDC_TOKEN_ID")
    token = w3.eth.contract(address=long_zero_address(usdc_id), abi=ERC20_ABI)
    tx = token.functions.transfer(evm_address_of(to), usdc_atomic(amount)).build_transaction({"from": account.address, "gas": 100_000})
    print(f"Sent {amount} USDC from {sender} to {to}  {tx_link(send(w3, account, tx))}")
    if wait:
        time.sleep(6)  # mirror node lag
        print(f"{to} now holds {format_usdc(token_balance(to, usdc_id))}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="overdraft")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("deploy-credit-line")
    p = sub.add_parser("deploy-splitter")
    p.add_argument("--name", default="main")
    p = sub.add_parser("register-agent")
    p.add_argument("--owner", default="OWNER", help="the HEDERA_<NAME> account that owns the agent's ID")
    p.add_argument("--uri", default="https://github.com/vansh0112/overdraft")
    sub.add_parser("approve-collateral").add_argument("--owner", default="OWNER")
    p = sub.add_parser("set-limit")
    p.add_argument("agent_id", type=int)
    p.add_argument("agent_account", help="the agent's Hedera account ID")
    p.add_argument("limit", help="limit in USDC, fee included")
    p.add_argument("--splitter", default="main")
    p.add_argument("--zg-account", help="the agent's 0G compute account (defaults to ZG_AGENT_ADDRESS)")
    p = sub.add_parser("request-draw")
    p.add_argument("agent_id", type=int)
    p.add_argument("amount")
    p.add_argument("--agent", default="AGENT", help="the HEDERA_<NAME> account that signs as the agent")
    for name in ("release-id", "mark-overdue", "credit-status"):
        sub.add_parser(name).add_argument("agent_id", type=int)
    p = sub.add_parser("flag-breach")
    p.add_argument("agent_id", type=int)
    p.add_argument("reason")
    for name in ("splitter-balance", "sweep"):
        sub.add_parser(name).add_argument("--name", default="main")
    p = sub.add_parser("send-usdc")
    p.add_argument("to")
    p.add_argument("amount")
    p.add_argument("--from", dest="sender", default="OPERATOR", help="the HEDERA_<NAME> account that pays")
    a = parser.parse_args()

    actions = {
        "deploy-credit-line": deploy_credit_line,
        "deploy-splitter": lambda: deploy_splitter(a.name),
        "register-agent": lambda: register_agent(a.owner, a.uri),
        "approve-collateral": lambda: approve_collateral(a.owner),
        "set-limit": lambda: set_limit(a.agent_id, a.agent_account, a.limit, a.splitter, a.zg_account),
        "request-draw": lambda: request_draw(a.agent_id, a.amount, a.agent),
        "release-id": lambda: operator_call("releaseId", a.agent_id),
        "mark-overdue": lambda: operator_call("markOverdue", a.agent_id),
        "flag-breach": lambda: operator_call("flagBreach", a.agent_id, a.reason),
        "credit-status": lambda: credit_status(a.agent_id),
        "splitter-balance": lambda: splitter_balance(a.name),
        "sweep": lambda: sweep(a.name),
        "send-usdc": lambda: send_usdc(a.to, a.amount, a.sender),
    }
    actions[a.command]()


if __name__ == "__main__":
    main()

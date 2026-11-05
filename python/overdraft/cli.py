"""Overdraft command line (Hedera testnet).

    python -m overdraft.cli deploy-credit-line
    python -m overdraft.cli deploy-splitter                          # deploy, associate USDC, bind the credit line
    python -m overdraft.cli set-limit AGENT_ID AGENT_ACCOUNT LIMIT_USDC [--zg-account 0x...]
    python -m overdraft.cli request-draw AGENT_ID AMOUNT_USDC         # signed by the agent's key
    python -m overdraft.cli credit-status AGENT_ID
    python -m overdraft.cli splitter-balance
    python -m overdraft.cli sweep
    python -m overdraft.cli send-usdc ACCOUNT AMOUNT_USDC
"""

import argparse
import time

from eth_account import Account
from web3 import Web3
from web3.logs import DISCARD

from .config import optional, read_deployments, required, write_deployments
from .hedera import (
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

ERC20_TRANSFER_ABI = [
    {
        "name": "transfer",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}],
        "outputs": [{"name": "", "type": "bool"}],
    }
]


def usdc_atomic(amount: str) -> int:
    return round(float(amount) * 1_000_000)


def tx_link(receipt) -> str:
    return hashscan_tx(receipt["transactionHash"].to_0x_hex())


def deployed(w3, name: str):
    """Returns (contract, deployments) for 'splitter' or 'creditLine'."""
    deployments = read_deployments()
    address = deployments.get(f"{name}EvmAddress")
    if not address:
        raise SystemExit(f"No {name} deployed yet.")
    abi_name = {"splitter": "IncomeSplitter", "creditLine": "CreditLine"}[name]
    return w3.eth.contract(address=address, abi=load_abi(abi_name)), deployments


def deploy(w3, account, file_name: str, contract_name: str, args: tuple, gas: int):
    abi, bytecode = compile_contract(file_name, contract_name)
    factory = w3.eth.contract(abi=abi, bytecode=bytecode)
    receipt = send(w3, account, factory.constructor(*args).build_transaction({"from": account.address, "gas": gas}))
    address = receipt["contractAddress"]
    contract_id = contract_id_of(address)
    print(f"{contract_name} deployed: {contract_id} ({address})  {tx_link(receipt)}")
    return w3.eth.contract(address=address, abi=abi), contract_id


def deploy_credit_line() -> None:
    w3, account = web3(), operator()
    contract, contract_id = deploy(
        w3, account, "CreditLine.sol", "CreditLine", (account.address, account.address, FEE_BPS), 2_000_000
    )
    write_deployments({"creditLineContractId": contract_id, "creditLineEvmAddress": contract.address})

    deployments = read_deployments()
    if deployments.get("splitterEvmAddress"):
        splitter, _ = deployed(w3, "splitter")
        if splitter.functions.creditLine().call() == "0x" + "0" * 40:
            tx = splitter.functions.bindCreditLine(contract.address).build_transaction({"from": account.address, "gas": 100_000})
            print(f"bindCreditLine() on splitter {deployments['splitterContractId']}: ok  {tx_link(send(w3, account, tx))}")


def deploy_splitter() -> None:
    w3, account = web3(), operator()

    def payout(env_name: str) -> str:
        account_id = optional(env_name)
        return evm_address_of(account_id) if account_id else account.address

    usdc = long_zero_address(required("USDC_TOKEN_ID"))
    args = (usdc, payout("OWNER_ACCOUNT_ID"), payout("POOL_ACCOUNT_ID"), payout("COMPUTE_BUCKET_ACCOUNT_ID"), LENDER_BPS, COMPUTE_BPS)
    splitter, contract_id = deploy(w3, account, "IncomeSplitter.sol", "IncomeSplitter", args, 1_500_000)
    write_deployments({"splitterContractId": contract_id, "splitterEvmAddress": splitter.address})

    receipt = send(w3, account, splitter.functions.associateUsdc().build_transaction({"from": account.address, "gas": 1_000_000}))
    print(f"associateUsdc(): ok  {tx_link(receipt)}")

    credit_line = read_deployments().get("creditLineEvmAddress")
    if credit_line:
        tx = splitter.functions.bindCreditLine(credit_line).build_transaction({"from": account.address, "gas": 100_000})
        print(f"bindCreditLine(): ok  {tx_link(send(w3, account, tx))}")
    print(f"x402 payTo = {contract_id}  {hashscan_contract(contract_id)}")


def set_limit(agent_id: int, agent_account: str, limit: str, zg_account: str | None) -> None:
    w3, account = web3(), operator()
    credit_line, deployments = deployed(w3, "creditLine")
    agent = evm_address_of(agent_account)
    zg = Web3.to_checksum_address(zg_account or optional("ZG_AGENT_ADDRESS") or agent)
    decision_hash = Web3.keccak(text=f"limit {agent_id} {limit} USDC")
    tx = credit_line.functions.setLimit(
        agent_id, agent, deployments["splitterEvmAddress"], zg, usdc_atomic(limit), decision_hash
    ).build_transaction({"from": account.address, "gas": 300_000})
    print(f"setLimit(agent {agent_id}, {limit} USDC, 0G account {zg}): ok  {tx_link(send(w3, account, tx))}")


def request_draw(agent_id: int, amount: str) -> None:
    w3 = web3()
    agent = Account.from_key(required("HEDERA_AGENT_KEY"))
    credit_line, _ = deployed(w3, "creditLine")
    tx = credit_line.functions.requestDraw(agent_id, usdc_atomic(amount)).build_transaction(
        {"from": agent.address, "gas": 300_000}
    )
    receipt = send(w3, agent, tx)
    for event in credit_line.events.DrawRequested().process_receipt(receipt, errors=DISCARD):
        a = event["args"]
        print(f"Loan request #{a['drawId']}: {format_usdc(a['amount'])} to 0G account {a['zgAccount']}; "
              f"owed now {format_usdc(a['owedAfter'])}  {tx_link(receipt)}")


def credit_status(agent_id: int) -> None:
    w3 = web3()
    credit_line, _ = deployed(w3, "creditLine")
    agent, splitter, zg_account, limit, _ = credit_line.functions.lines(agent_id).call()
    owed = credit_line.functions.owedOf(agent_id).call()
    available = credit_line.functions.availableOf(agent_id).call()
    print(f"Agent {agent_id}: agent {agent}, splitter {splitter}, 0G account {zg_account}")
    print(f"  limit {format_usdc(limit)}, owed {format_usdc(owed)}, available {format_usdc(available)}")
    for draw_id in range(credit_line.functions.drawCount().call()):
        draw_agent, amount, zg_tx = credit_line.functions.draws(draw_id).call()
        if draw_agent == agent_id:
            status = f"0G tx 0x{zg_tx.hex()}" if any(zg_tx) else "awaiting deposit"
            print(f"  loan #{draw_id}: {format_usdc(amount)}, {status}")


def splitter_balance() -> None:
    w3 = web3()
    splitter, deployments = deployed(w3, "splitter")
    balance = token_balance(deployments["splitterContractId"], required("USDC_TOKEN_ID"))
    print(f"Splitter {deployments['splitterContractId']} holds {format_usdc(balance)}; "
          f"owed to pool {format_usdc(splitter.functions.owed().call())}")


def sweep() -> None:
    w3, account = web3(), operator()
    splitter, _ = deployed(w3, "splitter")
    receipt = send(w3, account, splitter.functions.sweep().build_transaction({"from": account.address, "gas": 500_000}))
    for event in splitter.events.Swept().process_receipt(receipt, errors=DISCARD):
        a = event["args"]
        print(f"sweep(): {format_usdc(a['total'])} -> lender {format_usdc(a['toPool'])}, compute {format_usdc(a['toCompute'])}, "
              f"owner {format_usdc(a['toOwner'])}; owed now {format_usdc(a['owedAfter'])}  {tx_link(receipt)}")


def send_usdc(to: str, amount: str) -> None:
    """Sends USDC from the operator to another Hedera account (through the token's ERC-20 facade)."""
    w3, account = web3(), operator()
    usdc_id = required("USDC_TOKEN_ID")
    token = w3.eth.contract(address=long_zero_address(usdc_id), abi=ERC20_TRANSFER_ABI)
    tx = token.functions.transfer(evm_address_of(to), usdc_atomic(amount)).build_transaction({"from": account.address, "gas": 100_000})
    print(f"Sent {amount} USDC to {to}  {tx_link(send(w3, account, tx))}")
    time.sleep(6)  # mirror node lag
    print(f"{to} now holds {format_usdc(token_balance(to, usdc_id))}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="overdraft")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("deploy-credit-line", "deploy-splitter", "splitter-balance", "sweep"):
        sub.add_parser(name)
    p = sub.add_parser("set-limit")
    p.add_argument("agent_id", type=int)
    p.add_argument("agent_account", help="the agent's Hedera account ID")
    p.add_argument("limit", help="limit in USDC, fee included")
    p.add_argument("--zg-account", help="the agent's 0G compute account (defaults to ZG_AGENT_ADDRESS)")
    p = sub.add_parser("request-draw")
    p.add_argument("agent_id", type=int)
    p.add_argument("amount", help="loan amount in USDC")
    p = sub.add_parser("credit-status")
    p.add_argument("agent_id", type=int)
    p = sub.add_parser("send-usdc")
    p.add_argument("to")
    p.add_argument("amount")
    args = parser.parse_args()

    if args.command == "set-limit":
        set_limit(args.agent_id, args.agent_account, args.limit, args.zg_account)
    elif args.command == "request-draw":
        request_draw(args.agent_id, args.amount)
    elif args.command == "credit-status":
        credit_status(args.agent_id)
    elif args.command == "send-usdc":
        send_usdc(args.to, args.amount)
    else:
        {"deploy-credit-line": deploy_credit_line, "deploy-splitter": deploy_splitter,
         "splitter-balance": splitter_balance, "sweep": sweep}[args.command]()


if __name__ == "__main__":
    main()

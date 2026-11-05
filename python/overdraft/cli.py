"""Overdraft command line.

    python -m overdraft.cli deploy-splitter    # compile, deploy, sign the contract up for USDC
    python -m overdraft.cli associate-splitter # re-run the USDC sign-up if needed
    python -m overdraft.cli splitter-balance
    python -m overdraft.cli sweep
"""

import argparse
import time

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


def _splitter(w3):
    deployments = read_deployments()
    if "splitterEvmAddress" not in deployments:
        raise SystemExit("No splitter deployed yet. Run: python -m overdraft.cli deploy-splitter")
    return w3.eth.contract(address=deployments["splitterEvmAddress"], abi=load_abi("IncomeSplitter")), deployments


def deploy_splitter() -> None:
    w3, account = web3(), operator()
    abi, bytecode = compile_contract("IncomeSplitter.sol", "IncomeSplitter")

    def payout(env_name: str) -> str:
        account_id = optional(env_name)
        return evm_address_of(account_id) if account_id else account.address

    usdc = long_zero_address(required("USDC_TOKEN_ID"))
    args = (usdc, payout("OWNER_ACCOUNT_ID"), account.address, payout("POOL_ACCOUNT_ID"), payout("COMPUTE_BUCKET_ACCOUNT_ID"))
    print("constructor:", dict(zip(("usdc", "owner", "admin", "pool", "computeBucket"), args)))

    factory = w3.eth.contract(abi=abi, bytecode=bytecode)
    receipt = send(w3, account, factory.constructor(*args).build_transaction({"from": account.address, "gas": 1_500_000}))
    evm_address = receipt["contractAddress"]
    contract_id = contract_id_of(evm_address)
    print(f"IncomeSplitter deployed: {contract_id} ({evm_address})")
    print(hashscan_tx(receipt["transactionHash"].to_0x_hex()))
    write_deployments({"splitterContractId": contract_id, "splitterEvmAddress": evm_address})

    _associate(w3, account, w3.eth.contract(address=evm_address, abi=abi))
    print(f"Done. x402 payTo = {contract_id}  {hashscan_contract(contract_id)}")


def associate_splitter() -> None:
    w3, account = web3(), operator()
    splitter, _ = _splitter(w3)
    _associate(w3, account, splitter)


def _associate(w3, account, splitter) -> None:
    tx = splitter.functions.associateUsdc().build_transaction({"from": account.address, "gas": 1_000_000})
    receipt = send(w3, account, tx)
    print(f"associateUsdc(): ok {hashscan_tx(receipt['transactionHash'].to_0x_hex())}")


def set_owed(amount: str) -> None:
    """Admin: records how much USDC the agent owes the pool (the CreditLine contract will do this later)."""
    w3, account = web3(), operator()
    splitter, _ = _splitter(w3)
    atomic = round(float(amount) * 1_000_000)
    receipt = send(w3, account, splitter.functions.setOwed(atomic).build_transaction({"from": account.address, "gas": 100_000}))
    print(f"setOwed({format_usdc(atomic)}): ok {hashscan_tx(receipt['transactionHash'].to_0x_hex())}")


def splitter_balance() -> None:
    w3 = web3()
    splitter, deployments = _splitter(w3)
    balance = token_balance(deployments["splitterContractId"], required("USDC_TOKEN_ID"))
    owed = splitter.functions.owed().call()
    print(f"Splitter {deployments['splitterContractId']} holds {format_usdc(balance)}; owed to pool {format_usdc(owed)}")
    print(hashscan_contract(deployments["splitterContractId"]))


def sweep() -> None:
    w3, account = web3(), operator()
    splitter, deployments = _splitter(w3)
    usdc_id = required("USDC_TOKEN_ID")
    print(f"Before: {format_usdc(token_balance(deployments['splitterContractId'], usdc_id))}")
    receipt = send(w3, account, splitter.functions.sweep().build_transaction({"from": account.address, "gas": 500_000}))
    print(f"sweep(): ok {hashscan_tx(receipt['transactionHash'].to_0x_hex())}")
    for event in splitter.events.Swept().process_receipt(receipt, errors=DISCARD):
        a = event["args"]
        print(f"  total {format_usdc(a['total'])} -> pool {format_usdc(a['toPool'])}, "
              f"compute {format_usdc(a['toCompute'])}, owner {format_usdc(a['toOwner'])}; owed now {format_usdc(a['owedAfter'])}")
    time.sleep(6)  # mirror node lag
    print(f"After: {format_usdc(token_balance(deployments['splitterContractId'], usdc_id))}")


ERC20_TRANSFER_ABI = [
    {
        "name": "transfer",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}],
        "outputs": [{"name": "", "type": "bool"}],
    }
]


def send_usdc(to: str, amount: str) -> None:
    """Sends USDC from the operator to another Hedera account (through the token's ERC-20 facade)."""
    w3, account = web3(), operator()
    usdc_id = required("USDC_TOKEN_ID")
    atomic = round(float(amount) * 1_000_000)
    token = w3.eth.contract(address=long_zero_address(usdc_id), abi=ERC20_TRANSFER_ABI)
    tx = token.functions.transfer(evm_address_of(to), atomic).build_transaction({"from": account.address, "gas": 100_000})
    receipt = send(w3, account, tx)
    print(f"Sent {format_usdc(atomic)} to {to}: {hashscan_tx(receipt['transactionHash'].to_0x_hex())}")
    time.sleep(6)  # mirror node lag
    print(f"{to} now holds {format_usdc(token_balance(to, usdc_id))}")


COMMANDS = {
    "deploy-splitter": deploy_splitter,
    "associate-splitter": associate_splitter,
    "splitter-balance": splitter_balance,
    "sweep": sweep,
}


def main() -> None:
    parser = argparse.ArgumentParser(prog="overdraft")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in COMMANDS:
        sub.add_parser(name)
    owed_parser = sub.add_parser("set-owed", help="admin: set the amount owed to the pool")
    owed_parser.add_argument("amount", help="amount in USDC, e.g. 0.01")
    send_parser = sub.add_parser("send-usdc", help="send USDC from the operator to an account")
    send_parser.add_argument("to", help="Hedera account ID, e.g. 0.0.12345")
    send_parser.add_argument("amount", help="amount in USDC, e.g. 2")
    args = parser.parse_args()
    if args.command == "send-usdc":
        send_usdc(args.to, args.amount)
    elif args.command == "set-owed":
        set_owed(args.amount)
    else:
        COMMANDS[args.command]()


if __name__ == "__main__":
    main()

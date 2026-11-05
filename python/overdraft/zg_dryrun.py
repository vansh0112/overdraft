"""Free dry run of an Overdraft loan on 0G mainnet.

Simulates, against 0G's live PaymentVault, the exact call an Overdraft loan makes:
read the agent's compute balance, depositFor(agent) with the loan, read the balance again.
It uses eth_simulateV1 with a balance override for a throwaway sender, so nothing is spent
and nothing is written on-chain.

    python -m overdraft.zg_dryrun [--amount 0.5] [--out result.json]
"""

import argparse
import json
import os
import time
from pathlib import Path

import requests
from web3 import Web3

from .config import optional

RPC = optional("ZG_RPC_URL") or "https://evmrpc.0g.ai"
PAYMENT_VAULT = Web3.to_checksum_address("0xA3b15Bd2aD18BFB6b5f92D8AA9F444Dd59d1cE32")
EXPLORER = "https://chainscan.0g.ai"
DEPOSITED_TOPIC = Web3.keccak(text="Deposited(address,address,uint256)").to_0x_hex()


def selector(signature: str) -> str:
    return Web3.keccak(text=signature)[:4].hex()


def address_arg(address: str) -> str:
    return address[2:].lower().rjust(64, "0")


def rpc(method: str, params: list):
    body = requests.post(RPC, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=60).json()
    if "error" in body:
        raise RuntimeError(f"{method}: {body['error']}")
    return body["result"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulate an Overdraft loan deposit on 0G mainnet (nothing is spent).")
    parser.add_argument("--amount", type=float, default=0.5, help="loan size in 0G (default 0.5)")
    parser.add_argument("--out", type=Path, help="also write the result as JSON to this file")
    args = parser.parse_args()
    amount_0g = args.amount
    amount_wei = int(amount_0g * 10**18)
    agent = Web3.to_checksum_address(optional("ZG_AGENT_ADDRESS") or "0x" + os.urandom(20).hex())
    sender = Web3.to_checksum_address("0x" + os.urandom(20).hex())  # throwaway lender, funded only in the simulation

    chain_id = int(rpc("eth_chainId", []), 16)
    block = int(rpc("eth_blockNumber", []), 16)
    balance_of = {"from": sender, "to": PAYMENT_VAULT, "data": "0x" + selector("balanceOf(address)") + address_arg(agent)}
    deposit = {
        "from": sender,
        "to": PAYMENT_VAULT,
        "data": "0x" + selector("depositFor(address)") + address_arg(agent),
        "value": hex(amount_wei),
    }
    overrides = {sender: {"balance": hex(amount_wei * 10)}}

    simulated = rpc(
        "eth_simulateV1",
        [{"blockStateCalls": [{"stateOverrides": overrides, "calls": [balance_of, deposit, balance_of]}], "validation": False}, "latest"],
    )
    before_call, deposit_call, after_call = simulated[0]["calls"]
    before = int(before_call["returnData"], 16)
    after = int(after_call["returnData"], 16)
    deposited_events = [log for log in deposit_call.get("logs", []) if log["topics"][0] == DEPOSITED_TOPIC]
    gas = int(rpc("eth_estimateGas", [deposit, "latest", overrides]), 16)
    ok = deposit_call["status"] == "0x1" and after - before == amount_wei and bool(deposited_events)

    result = {
        "network": "0G mainnet",
        "chainId": chain_id,
        "block": block,
        "paymentVault": PAYMENT_VAULT,
        "paymentVaultUrl": f"{EXPLORER}/address/{PAYMENT_VAULT}",
        "agent": agent,
        "loan0G": amount_0g,
        "balanceBefore0G": before / 10**18,
        "balanceAfter0G": after / 10**18,
        "depositedEvent": bool(deposited_events),
        "gasEstimate": gas,
        "ok": ok,
        "simulatedAt": time.strftime("%Y-%m-%d %H:%M:%S %Z"),
        "method": "eth_simulateV1 against the live PaymentVault (no transaction sent, nothing spent)",
    }

    print(f"0G mainnet (chain {chain_id}), block {block}")
    print(f"PaymentVault {PAYMENT_VAULT}  {result['paymentVaultUrl']}")
    print(f"Agent {agent}")
    print(f"  compute balance before: {result['balanceBefore0G']} 0G")
    print(f"  depositFor(agent) with {amount_0g} 0G: status {deposit_call['status']}, Deposited event: {result['depositedEvent']}, gas ~{gas}")
    print(f"  compute balance after:  {result['balanceAfter0G']} 0G")
    print("DRY RUN:", "PASSED (the loan deposit works on 0G mainnet)" if ok else "FAILED")

    if args.out:
        args.out.write_text(json.dumps(result, indent=2) + "\n")
        print(f"Saved: {args.out}")


if __name__ == "__main__":
    main()

"""Compiles the Solidity contracts in ../contracts.

Uses solc-js 0.8.28 from gateway/node_modules (via gateway/scripts/solc-compile.mjs), because the
native solc download server is very slow from this network.
"""

import json
import subprocess

from .config import CONTRACTS_DIR, DEPLOYMENTS_DIR, ROOT

COMPILER = ROOT / "gateway" / "scripts" / "solc-compile.mjs"


def compile_contract(file_name: str, contract_name: str) -> tuple[list, str]:
    """Returns (abi, bytecode) and saves the ABI next to the deployments."""
    standard_input = {
        "language": "Solidity",
        "sources": {file_name: {"content": (CONTRACTS_DIR / file_name).read_text()}},
        "settings": {
            "optimizer": {"enabled": True, "runs": 200},
            "evmVersion": "paris",
            "outputSelection": {"*": {"*": ["abi", "evm.bytecode.object"]}},
        },
    }
    result = subprocess.run(
        ["node", str(COMPILER)],
        input=json.dumps(standard_input),
        capture_output=True,
        text=True,
        cwd=ROOT / "gateway",
        check=True,
    )
    output = json.loads(result.stdout)
    errors = [e["formattedMessage"] for e in output.get("errors", []) if e["severity"] == "error"]
    if errors:
        raise SystemExit("\n".join(errors))

    artifact = output["contracts"][file_name][contract_name]
    DEPLOYMENTS_DIR.mkdir(exist_ok=True)
    (DEPLOYMENTS_DIR / f"{contract_name}.abi.json").write_text(json.dumps(artifact["abi"], indent=2) + "\n")
    return artifact["abi"], artifact["evm"]["bytecode"]["object"]


def load_abi(contract_name: str) -> list:
    return json.loads((DEPLOYMENTS_DIR / f"{contract_name}.abi.json").read_text())

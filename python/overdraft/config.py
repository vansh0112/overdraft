"""Settings shared with the TypeScript gateway: one .env at the repo root."""

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
CONTRACTS_DIR = ROOT / "contracts"
DEPLOYMENTS_DIR = ROOT / "deployments"
HEDERA_DEPLOYMENTS = DEPLOYMENTS_DIR / "hedera-testnet.json"

load_dotenv(ROOT / ".env")


def required(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        sys.exit(f"Missing {name} in .env (see .env.example).")
    return value


def optional(name: str) -> str | None:
    value = (os.getenv(name) or "").strip()
    return value or None


def read_deployments() -> dict:
    return json.loads(HEDERA_DEPLOYMENTS.read_text()) if HEDERA_DEPLOYMENTS.exists() else {}


def write_deployments(updates: dict) -> None:
    DEPLOYMENTS_DIR.mkdir(exist_ok=True)
    HEDERA_DEPLOYMENTS.write_text(json.dumps({**read_deployments(), **updates}, indent=2) + "\n")

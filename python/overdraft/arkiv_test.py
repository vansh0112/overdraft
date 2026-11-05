"""Test 3: write a credit-bureau record to Arkiv (Rabdi) and read it back, filtered by the bureau wallet.

    python -m overdraft.arkiv_test
"""

import json
import time

from . import arkiv
from .arkiv import Attr

SCHEMA = "overdraft.bureau"
NINETY_DAYS = 90 * arkiv.BLOCKS_PER_DAY  # 3,888,000 blocks


def main() -> None:
    account = arkiv.bureau()
    funds = arkiv.balance(account.address)
    print(f"Bureau wallet {account.address}: {funds / 1e18:.6f} (Rabdi gas token)")
    if funds == 0:
        raise SystemExit("Bureau wallet has no funds yet. Fund it at https://hub.arkiv.network/faucet (Rabdi).")

    timing = arkiv.block_timing()
    print(f"Rabdi current block: {timing['current_block']}")

    created = arkiv.create_entity(
        [
            Attr("arkiv.schema", "str", SCHEMA),
            Attr("kind", "str", "mark"),
            Attr("agentId", "u64", 1),
            Attr("reason", "str", "test 3: a 90-day mark that expires like a real credit report"),
            Attr("limitCents", "u64", 500),
            Attr("memo", "bytes", b"Hello from Overdraft's credit bureau", indexed=False),
        ],
        NINETY_DAYS,
    )
    print(f"Created entity {created['key']}")
    print(f"  tx {created['txHash']}  (explorer: https://rabdi.explorer.arkiv.network/tx/{created['txHash']})")
    blocks_left = created["expiresAt"] - timing["current_block"]
    print(f"  expires at block {created['expiresAt']} (about {blocks_left / arkiv.BLOCKS_PER_DAY:.1f} days)")

    time.sleep(3)  # reads right after a write can lag by about a block

    condition = (
        f"arkiv.schema = str('{SCHEMA}') AND $owner = addr({account.address}) "
        f"AND kind = str('mark') AND agentId = u64(1)"
    )
    page = arkiv.query(
        condition,
        select={"key": True, "owner": True, "expiresAt": True, "attributes": True, "count": True},
        limit=10,
    )
    keys = [row["key"] for row in page["data"]]
    print(f"\nQuery: {condition}")
    print(f"  matches: {int(page.get('count', '0x0'), 16)}; ours found: {created['key'] in keys}")

    entity = arkiv.get_entity(created["key"])
    print("\narkiv_getEntity:")
    print(json.dumps(entity, indent=2)[:1500])

    ok = created["key"] in keys and entity is not None and entity.get("owner", "").lower() == account.address.lower()
    print("\nTEST 3:", "PASSED" if ok else "FAILED")


if __name__ == "__main__":
    main()

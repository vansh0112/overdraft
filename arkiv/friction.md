# Arkiv feedback

What got in our way building Overdraft's credit bureau on Rabdi, with what we expected, what happened, how to reproduce it and what would help. The first is the one that matters most to us, because a credit history only grows.

## What got in our way

### 1. Paging past 100 results only works within a single block

- **Expected:** read every record that matches a query, 100 at a time, following the cursor.
- **What happened:** the second page usually failed. Without `atBlock`, the error is `-32005 cursor belongs to a different query, block or select — start a new page-through`, because a new block arrived between pages. With `atBlock` set to the first page's `blockNumber`, it's `-32006 block N is unavailable: state for this block is not retained`. The public node answers only at the latest block: one block back (about 2 seconds) is already unavailable. So a page-through has to finish inside one block, and with `attributes` selected, two pages of 100 often don't.
- **Reproduce:** run a query with more than 100 matches, for example `arkiv.schema = str('overdraft.bureau') AND $owner = addr(0x95cbCb85d4591eD0A71A34099689491f4892841A)` with `limit: "0x64"` and `select: {key, attributes}`, then request the next page with the returned `cursor`, with and without `atBlock`. Or query any block one behind the latest with `atBlock`: it returns `-32006`.
- **What we did:** later pages pass `atBlock`, and a page-through that outlives its block starts again from the first page ([`arkiv.py`](../python/overdraft/arkiv.py)). It works today, but gets less reliable as an agent's history grows.
- **Suggestion:** keep state for a few minutes of blocks, or let a cursor carry its own snapshot, so a page-through isn't racing a 2-second clock.

### 2. The anonymous request budget runs out quietly

- **Expected:** a read-only dashboard can poll a few queries without an account.
- **What happened:** the anonymous budget (10,000 cost units, 2,000 per short window, 10 units per query) ran out while our live pages polled agents' histories, and reads started failing with rate-limit responses. We couldn't see how much budget was left until it was gone. An access key (`X-API-KEY`) fixed it.
- **Suggestion:** return the remaining budget in response headers, so an app can slow down before it's cut off.

### 3. No current Python client for Rabdi

- **Expected:** a Python SDK, since our services are Python.
- **What happened:** the Python SDK predates Rabdi, so we wrote a small client against the JSON-RPC docs, encoding `execute((uint8,bytes)[])` operations, attribute types and the indexed flag ourselves ([`arkiv.py`](../python/overdraft/arkiv.py)). The JSON-RPC docs were enough, but it took time we'd rather have spent on the product.
- **Suggestion:** a maintained Python client with the same coverage as `@arkiv-network/sdk`.

### 4. One trusted owner, several writers

- **Expected:** three of our services (the bureau watcher, the relay and enrolment) write records that readers should trust because one bureau wallet owns them.
- **What happened:** they all sign with that one wallet, so they share its nonce, and simultaneous writes collided until we used the pending nonce with retries and batched writes where possible. `changeOwnership` would let each service write with its own key and hand the record to the bureau, but that's a second transaction per record, and `$creator` would still show the worker's key.
- **Suggestion:** let an owner authorise other keys to create entities owned by it, for any app with many workers and one trusted identity.

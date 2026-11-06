# Why Arkiv

## What users would lose if the bureau were Postgres

A credit history is only useful if people who don't trust the lender can rely on it: other lenders, marketplaces hiring the agent, and the agent's own owner. In our own database it would be a private claim. On Arkiv:

1. **Anyone can read it without asking us.** One query, no API key, no account with Overdraft (see [`schema.md`](schema.md#try-it)). Another lender can check "has agent #141 defaulted?" without integrating with us, and the history stays readable even if our server is down.
2. **Records can be checked, not just trusted.** Only the bureau wallet can write them, and each one can be checked against Hedera ([how](how-you-use-arkiv.md#who-can-edit-each-entity)). With Postgres, an admin could edit history and readers would never know.
3. **Old marks really do expire.** A default drops off after 90 days because Arkiv deletes it, not because we promise to. In a database, "we delete defaults after 90 days" is a policy users have to trust.
4. **Owners can prove what they applied with.** Their own signature is in the enrolment record; in a database we could alter what they said.
5. **It outlives us.** If Overdraft stopped running, every agent's history would stay public until it expired, readable by the next lender.

What we'd gain with Postgres (faster reads, unlimited lifetimes, private data) is exactly what a public credit report shouldn't have.

## What we kept off Arkiv, and why

| Kept off Arkiv | Where it lives | Why |
|---|---|---|
| Money, limits, debts and collateral | `CreditLine` and `IncomeSplitter` contracts on Hedera | These need enforcement (the splitter must pay the lender first, the ID must stay locked), not just a record. Arkiv records what happened; Hedera makes it happen |
| The loans themselves | 0G's PaymentVault (simulated here) | The loan must become compute that can't be withdrawn |
| An agent's live budget and job queue | The agent's own status API | It changes every second and is only useful now; a record of it would be noise |
| Customers' job contents | Nowhere | Private, and not part of anyone's credit |
| Enrolment job progress, read caches | The console API's memory and local state | Operational state of our server, not history anyone else needs |
| Keys and the Arkiv access key | Server environment variables | Secrets |

The rule we followed: **if another party needs to rely on it later, it goes on Arkiv; if it needs enforcing, it goes on Hedera; if it's only useful now, it stays in the app.**

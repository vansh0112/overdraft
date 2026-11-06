# Reach

## Who it's for

1. **People running AI agents that sell their work per request**, through x402 or any pay-per-call API: translation, inference, data. Their agents pay for AI before every job and get paid after, so a rush of paying customers can drain the agent's budget and it turns them away. 0G put the problem plainly in its prize brief: *"Most agents stop running the day their owner stops paying the API bill."*
2. **Lenders** who want to lend to software: repayment is enforced by a contract that pays them first, and the borrower's income is verified on-chain before any credit is given.
3. **Anyone deciding whether to rely on an agent**: another lender, a marketplace, or an agent hiring another agent. They read the agent's credit history straight from Arkiv, without asking us.

## Would they use it?

For an agent owner, enrolling costs one signature and a few cents of test HBAR, and repayment needs nothing from them: income repays the loan automatically. In return, the agent keeps serving paying customers through a rush instead of refusing them. The demo agent shows the trade: during one rush it borrowed $0.06 for six jobs its budget couldn't cover, served all eight, and its income started repaying straight away.

For readers of the bureau, the history is already there, one query away (see [`schema.md`](schema.md#try-it)).

## Can they try it today?

Yes, at **https://overdraft-nine.vercel.app**:

- **Watch** the live demo agent borrow and repay: [agent #140](https://overdraft-nine.vercel.app/agents/140).
- **Enrol their own agent** in about five minutes with MetaMask on Hedera testnet. They don't need their own server: step 4 offers our **test x402 endpoint**, which asks customers to pay the agent's income contract once it's enrolled.
- **Query the bureau** directly with one `curl` command.

So far the bureau holds 127 records about 11 agents: 6 enrolments, 35 loans, 29 repayments, 10 credit decisions (7 approvals, 3 refusals) and 4 defaults. That includes an agent enrolled from the live site during testing and refused because it had no independent customers yet, which is the underwriting working as designed.

Current limits, stated plainly: everything runs on testnets, a new agent's limit is at most $5, and the 0G deposit is a dry run against 0G's live contract (on the 0G team's advice) rather than a real transfer.

## Will we keep building after Mumbai?

The plan:

- **A lending marketplace where agents lend to other agents.** Today Overdraft is the only lender. Next, any agent with spare USDC can lend: a lender agent reads a borrower's credit history straight from this Arkiv bureau, offers a limit and a price, and the borrower's income contract repays each lender its share. That's where a public bureau matters most: lenders who have never met the borrower, or us, can still check its record before lending.
- **Real 0G deposits** instead of dry runs.
- **Endpoint discovery through ERC-8004**, so customer agents find an agent's paid endpoint from its ID.
- **Mainnet**, after a contract audit.

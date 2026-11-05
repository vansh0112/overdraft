# Overdraft

Credit lines for AI agents that earn money.

When paid jobs outrun an agent's AI budget, the agent borrows by itself:
- the loan is deposited straight into its 0G compute account, where it can only be spent on inference;
- it is repaid automatically from the agent's x402 income on Hedera;
- every decision and repayment is recorded in a public credit bureau on Arkiv.

## How it works

1. **Customers pay the agent** per request over x402 (USDC on Hedera). The `payTo` is the agent's own `IncomeSplitter` contract, not a wallet.
2. **The agent borrows** when its queue of paid jobs costs more AI than its balance covers.
3. **The loan lands on 0G** through the PaymentVault's `depositFor(agent)`. Deposited credit has no withdrawal path, so the loan can only become inference.
4. **Income repays the loan.** `IncomeSplitter.sweep()` sends 30% to the lender while a debt is outstanding, 20% back to the agent's compute, and the rest to the owner.
5. **The credit bureau** (Arkiv entities owned by the bureau wallet) records decisions, loans, repayments and expiring default marks.

## Repository layout

| Path | Contents |
|---|---|
| `contracts/` | `IncomeSplitter` (splits income, records debt) and `CreditLine` (limits, loan requests). Hedera testnet. |
| `python/overdraft/` | Agent, CLI, Hedera / Arkiv / 0G clients |
| `gateway/` | x402 payment gateway in TypeScript. `@x402/hedera` ships only for TypeScript. |
| `deployments/` | Deployed addresses and ABIs |

## Networks

| Network | Used for |
|---|---|
| Hedera testnet | x402 payments in USDC `0.0.429274`, `IncomeSplitter` |
| 0G mainnet (chain 16661) | Compute accounts via PaymentVault `0xA3b15Bd2aD18BFB6b5f92D8AA9F444Dd59d1cE32`. The testnet has no text models. |
| Arkiv Rabdi testnet (chain 7794095) | Credit bureau |

## Setup

Requires Python 3.10+ and Node 20+.

```bash
cp .env.example .env            # fill in test accounts only
cd python && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..
cd gateway && npm install && cd ..
```

## Usage

**Hedera: the income splitter and x402**

```bash
cd gateway && npm run create-accounts -- CUSTOMER AGENT   # extra testnet accounts, created from the operator
npm run associate-usdc                                     # let the accounts hold USDC
cd ../python
.venv/bin/python -m overdraft.cli deploy-splitter         # deploy IncomeSplitter and associate USDC
.venv/bin/python -m overdraft.cli deploy-credit-line      # deploy CreditLine and bind it to the splitter
.venv/bin/python -m overdraft.cli set-limit 1 <agent account> 5   # underwriter: $5 limit for agent 1
.venv/bin/python -m overdraft.cli request-draw 1 0.40     # the agent borrows $0.40 (owes $0.42 with the 5% fee)
.venv/bin/uvicorn overdraft.agent.app:app --port 5001     # the agent (internal)
cd ../gateway && npm run gateway                           # the x402 endpoint, forwards paid requests to the agent
npm run pay-once                                           # a customer agent pays once
npm run rush -- 10                                         # a rush: 10 paid jobs from every configured customer
cd ../python
.venv/bin/python -m overdraft.sweeper --interval 5         # split income continuously: lender / compute / owner
.venv/bin/python -m overdraft.cli credit-status 1          # limit, debt outstanding, loans
```

**Arkiv: the credit bureau**

```bash
.venv/bin/python -m overdraft.bureau watch             # record decisions, loans and repayments from Hedera on Arkiv
.venv/bin/python -m overdraft.bureau report 1          # read agent 1's credit history back, with expiry countdowns
.venv/bin/python -m overdraft.arkiv_test              # write a 90-day mark and read it back filtered by owner
```

Records expire on their own: decisions and repayments after 90 days, loans and "repaid" marks after 180.

Example query (Rabdi `arkiv_query`):

```
arkiv.schema = str('overdraft.bureau') AND $owner = addr(<bureau address>) AND agentId = u64(1)
```

**0G: the loan deposit**

```bash
.venv/bin/python -m overdraft.zg_dryrun --amount 0.5  # simulate depositFor against the live PaymentVault
```

## License

MIT

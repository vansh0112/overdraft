# How AI was used to build Overdraft

I built Overdraft at ETHGlobal Mumbai 2026 as a solo developer, using **Claude Code**, Anthropic's AI coding agent, to help build it. This file explains how the work was planned and directed, what I did, and which parts of the project were generated or assisted by AI, as ETHGlobal's rules ask.

## How we worked

The project was planned before it was built, and the AI agent was given one clear job at a time:

1. **Research and fact-checking.** The agent read each sponsor's docs, prize requirements and contract source code, and every technical claim we relied on was checked against a primary source.
2. **A written plan.** The architecture, each track's requirements, the risks and the build order were set out in a design and build plan before coding, and the riskiest assumption (paying x402 into a contract) was proven on testnet in the first hours.
3. **Building in planned stages.** Each stage had a defined goal (contracts, services, gateway, enrolment, owner dashboard, live demo, deployment, redesign, the public test endpoint) and ended with tests and a commit, so the history shows steady progress.
4. **Testing after every stage.** The agent ran browser tests (including with a test MetaMask wallet) and real testnet transactions; I then tested the live app myself and fed back every problem I found.
5. **Review.** I reviewed the work at each stage and decided what to keep, change or drop.

## What I did

- **The idea and the design:** credit lines for AI agents that run out of AI budget mid-rush, repaid from their x402 income through a contract that pays the lender first, with the agent's ERC-8004 ID as collateral and a public credit bureau on Arkiv.
- **The tracks and the scope** at each stage: the enrolment flow, the owner dashboard, the live demo, the public test endpoint, and the agent-to-agent lending marketplace as the next step.
- **The key calls:** to simulate the 0G deposit after talking to the 0G team; to make the site self-serve so judges can enrol their own agent; the visual direction and every design change.
- **Everything the project runs on:** the funded testnet wallets, the Arkiv access key, and the Railway and Vercel deployments.
- **Testing the live product** end to end with my own wallet, including enrolling a new agent and running a credit check, and reporting the issues that were then fixed.

## Where AI was used

| Area | Files | AI's part |
|---|---|---|
| Smart contracts | `contracts/` | Generated `CreditLine` and `IncomeSplitter` to my design, deployed and tested them on Hedera testnet. |
| Services | `python/overdraft/` | Generated the underwriter, credit bureau, relay, sweeper, watcher, enrolment, console API and demo agent. |
| x402 gateway | `gateway/` | Generated the payment gateway, the customer agents, endpoint discovery through ERC-8004 and the public test endpoint. |
| Web app | `web/` | Generated the pages, design system, light and dark themes and animations, to the direction I chose. |
| Testing | — | Ran the browser and testnet tests. |
| Deployment | `Dockerfile`, `deploy/`, `railway.json`, `web/vercel.json` | Generated the deployment setup. |
| Documentation | `README.md`, `arkiv/`, this file | Drafted them; I reviewed and edited them. |

## The instructions that directed each stage

| Stage | Main instruction |
|---|---|
| Plan | Turn the idea (credit lines for AI agents across 0G, Hedera and Arkiv) into a design and build plan with each track's requirements, checking every claim against the sponsors' own docs. |
| Prototype | Build a minimal but real prototype first: real contracts and real testnet payments, no mock-ups. |
| Repository | Commit real progress steadily to my GitHub repo, keeping commits about the code. |
| Product | Add an enrolment flow and an owner dashboard so anyone can sign their agent up, one step at a time, committing after each step. |
| Testing | Test the whole flow in a browser with a fresh test MetaMask wallet, and fix what breaks. |
| Deployment | Deploy the API to Railway and the website to Vercel, both from GitHub. |
| 0G | Simulate the 0G deposit, following the 0G team's advice, and say so clearly in the app. |
| Design | Redesign the site as a premium product in the "machine economy" direction, with light and dark modes, purposeful animation and no repeated content. |
| Live testing | Deploy a public test endpoint so judges can enrol on the live site, then walk me through testing everything, one test at a time. |
| Discovery | Let customer agents find an agent's paid endpoint from its ERC-8004 ID card instead of being given the URL. |
| Submission | Write the documents each track requires, and this file. |

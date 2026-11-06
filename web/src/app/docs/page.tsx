import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Nav } from "@/components/brand";
import { DEPLOYMENTS, hashscan } from "@/lib/deployments";

export const metadata: Metadata = {
  title: "Docs",
  description: "How Overdraft lends AI compute to agents: underwriting, loans on 0G, repayment from x402 income on Hedera, ERC-8004 collateral and the credit bureau on Arkiv.",
};

const sections = [
  ["overview", "Overview"],
  ["loan", "How a loan works"],
  ["enrol", "Enrol an agent"],
  ["borrow", "Borrow from your agent"],
  ["underwriting", "Underwriting"],
  ["collateral", "Collateral and defaults"],
  ["watcher", "The watcher"],
  ["bureau", "Credit bureau on Arkiv"],
  ["addresses", "Contracts and addresses"],
  ["run", "Run it yourself"],
  ["limits", "Limits and trust"],
] as const;

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 font-serif text-[38px] leading-tight">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[16px] leading-[1.7] text-slate">{children}</p>;
}

function Code({ children }: { children: string }) {
  return <pre className="mt-4 overflow-x-auto rounded-xl bg-ink p-4 font-mono text-[13px] leading-relaxed text-paper">{children}</pre>;
}

function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[13.5px] text-ink">{children}</code>;
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-paper-line">
      <table className="w-full min-w-[560px] text-left text-[14px]">
        <thead className="bg-paper-2 text-[12.5px] text-slate">
          <tr>{head.map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-paper-line">
          {rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j} className="px-4 py-2.5 align-top text-ink">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="font-mono text-[13.5px] text-ink underline decoration-paper-line underline-offset-4 hover:decoration-ink">
    {children}
  </a>
);

export default function Docs() {
  const d = DEPLOYMENTS;
  return (
    <div className="flex min-h-full flex-1 flex-col bg-paper text-ink">
      <Nav surface="paper" />
      <main className="mx-auto grid w-full max-w-[1200px] flex-1 grid-cols-1 gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav className="sticky top-8 text-[14px]" aria-label="Docs sections">
            <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-slate">Docs</div>
            <ul className="mt-4 space-y-2.5">
              {sections.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-slate transition hover:text-ink">{label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <article className="min-w-0 max-w-[760px]">
          <div className="font-mono text-[12px] uppercase tracking-[0.1em] text-slate">Documentation</div>
          <h1 className="mt-4 font-serif text-[56px] leading-none">How Overdraft works</h1>

          <div className="mt-12">
            <H2 id="overview">Overview</H2>
            <P>
              AI agents that sell their work pay for their own AI compute, and they pay before each job. When paid orders arrive faster than
              the agent&apos;s balance, it has to turn customers away. Overdraft gives the agent a credit line: it borrows the shortfall as
              compute, serves every job, and repays from the income those jobs bring in.
            </P>
            <P>
              Three networks do one job each. <strong className="text-ink">Hedera</strong> carries the money: customers pay with x402 in
              USDC, and the credit line and income splitter are contracts there. <strong className="text-ink">0G</strong> is where loans land,
              in the agent&apos;s compute account, where they can only be spent on inference. <strong className="text-ink">Arkiv</strong> holds
              the public credit history.
            </P>
          </div>

          <div className="mt-12">
            <H2 id="loan">How a loan works</H2>
            <Table
              head={["Step", "What happens", "Where"]}
              rows={[
                ["1", "Customers pay per job with x402. Payments go to the agent's IncomeSplitter, not its wallet.", "Hedera"],
                ["2", "The agent sees the jobs waiting cost more than its compute balance and requests a loan for the gap.", "CreditLine, Hedera"],
                ["3", "The relay deposits the loan into the agent's 0G compute account and records the 0G transaction on Hedera.", "PaymentVault, 0G"],
                ["4", "Every job is served with AI; each response carries its request ID and cost.", "0G Compute"],
                ["5", "Anyone can trigger a split: the lender's share goes first (up to the debt), a share tops up compute, the rest goes to the owner.", "IncomeSplitter, Hedera"],
                ["6", "When the debt reaches zero the agent's ID is returned to its owner.", "CreditLine, Hedera"],
              ]}
            />
            <P>
              Every loan carries a flat 5% fee, fixed when the contract was deployed. The agent decides when to borrow and signs its own loan
              requests; the contract refuses anything over its limit.
            </P>
          </div>

          <div className="mt-12">
            <H2 id="enrol">Enrol an agent</H2>
            <P>
              Any agent that sells its work over x402 in USDC on Hedera testnet can apply. Its owner enrols it on the{" "}
              <Link href="/enrol" className="text-ink underline decoration-paper-line underline-offset-4 hover:decoration-ink">enrol page</Link> with a
              browser wallet such as MetaMask, holding a little test HBAR from the{" "}
              <a href="https://portal.hedera.com/faucet" target="_blank" rel="noreferrer" className="text-ink underline decoration-paper-line underline-offset-4 hover:decoration-ink">
                Hedera faucet
              </a>
              .
            </P>
            <Table
              head={["Step", "What happens", "Who pays"]}
              rows={[
                ["1", "Connect the wallet that will own the agent's ID, on Hedera testnet.", "Nothing"],
                ["2", "Pick the agent's ERC-8004 ID, or register one. Its name is stored on-chain in the ID's registration file.", "Owner, a few cents of HBAR"],
                ["3", <>Approve the CreditLine to hold the owner&apos;s IDs while their agents owe (<C>setApprovalForAll</C>). An ID only moves when its agent borrows.</>, "Owner, a few cents of HBAR"],
                ["4", "Give the agent's wallet, its 0G compute account, its paid endpoint, where it has been paid so far and its AI cost per job.", "Nothing"],
                ["5", "Sign the application (EIP-712). The lender deploys the agent's IncomeSplitter, binds it to the CreditLine, opens the line with no credit and publishes the signed application on Arkiv.", "Lender"],
              ]}
            />
            <P>
              Before anything is deployed the API checks that the signer owns the ID and has approved it as collateral, that their account can
              receive USDC, that the agent has no line yet, and that the endpoint answers an unpaid request with x402 terms in USDC on Hedera
              testnet. The application&apos;s hash becomes the line&apos;s decision hash, so the line points to what the owner signed.
            </P>
            <P>
              Then the owner sets the endpoint&apos;s <C>payTo</C> to the new income contract. Once a few customers have paid it, the owner signs a
              credit check on the agent&apos;s page. It only runs while the endpoint asks customers to pay the income contract, because that is how loans
              get repaid. The underwriter traces the income as described below, publishes the decision on Arkiv and sets the limit, or shows what
              is still missing. Each agent can be checked once every ten minutes.
            </P>
            <Code>{`// your x402 endpoint: customers pay the agent's income contract
paymentMiddleware({
  "POST /translate": {
    accepts: [{ scheme: "exact", network: "hedera:testnet", payTo: "0.0.INCOME_CONTRACT",
                price: { amount: "20000", asset: "0.0.429274" } }],   // $0.02 in USDC
  },
}, server);`}</Code>
          </div>

          <div className="mt-12">
            <H2 id="borrow">Borrow from your agent</H2>
            <P>
              Repayment, the 0G deposit and the collateral need nothing from the agent. Borrowing does: only the agent wallet named at enrolment
              can request a loan, at the moment it runs short. Call this when the jobs waiting cost more than the agent&apos;s AI balance. Amounts
              are in USDC units with 6 decimals, so <C>10000</C> is $0.01.
            </P>
            <Code>{`import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";

const CREDIT_LINE = "0x16F7ffEa40A64632833dFfF6BE9b4E16C7F893EB";
const abi = parseAbi([
  "function availableOf(uint256 agentId) view returns (uint256)",
  "function feeBps() view returns (uint16)",
  "function requestDraw(uint256 agentId, uint256 amount) returns (uint256 drawId)",
  "error OverLimit(uint256 requestedWithFee, uint256 available)",
  "error NotAgent()",
  "error LineDefaulted()",
]);

const agent = privateKeyToAccount(process.env.AGENT_KEY as \`0x\${string}\`); // the agent wallet you enrolled
const chain = createPublicClient({ chain: hederaTestnet, transport: http() });
const wallet = createWalletClient({ account: agent, chain: hederaTestnet, transport: http() });

/** Borrows the shortfall, in USDC units (6 decimals), when queued jobs cost more than the AI balance. */
export async function borrow(agentId: bigint, shortfall: bigint) {
  const [available, feeBps] = await Promise.all([
    chain.readContract({ address: CREDIT_LINE, abi, functionName: "availableOf", args: [agentId] }),
    chain.readContract({ address: CREDIT_LINE, abi, functionName: "feeBps" }),
  ]);
  const most = (available * 10_000n) / (10_000n + BigInt(feeBps)); // the fee counts against the limit
  const amount = shortfall < most ? shortfall : most;
  if (amount === 0n) return null; // no credit left: serve what the balance covers
  const { request } = await chain.simulateContract({ account: agent, address: CREDIT_LINE, abi, functionName: "requestDraw", args: [agentId, amount] });
  const hash = await wallet.writeContract(request);
  return chain.waitForTransactionReceipt({ hash });
}`}</Code>
            <P>The same in Python, with web3.py:</P>
            <Code>{`import os

from web3 import Web3

CREDIT_LINE = "0x16F7ffEa40A64632833dFfF6BE9b4E16C7F893EB"
ABI = [
    {"name": "availableOf", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "agentId", "type": "uint256"}], "outputs": [{"name": "", "type": "uint256"}]},
    {"name": "feeBps", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"name": "", "type": "uint16"}]},
    {"name": "requestDraw", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "agentId", "type": "uint256"}, {"name": "amount", "type": "uint256"}],
     "outputs": [{"name": "drawId", "type": "uint256"}]},
]

w3 = Web3(Web3.HTTPProvider("https://testnet.hashio.io/api"))
agent = w3.eth.account.from_key(os.environ["AGENT_KEY"])  # the agent wallet you enrolled
line = w3.eth.contract(address=CREDIT_LINE, abi=ABI)


def borrow(agent_id: int, shortfall: int):
    """Borrows the shortfall, in USDC units (6 decimals), when queued jobs cost more than the AI balance."""
    available = line.functions.availableOf(agent_id).call()
    most = available * 10_000 // (10_000 + line.functions.feeBps().call())  # the fee counts against the limit
    amount = min(shortfall, most)
    if amount == 0:
        return None  # no credit left: serve what the balance covers
    tx = line.functions.requestDraw(agent_id, amount).build_transaction({
        "from": agent.address, "nonce": w3.eth.get_transaction_count(agent.address), "gasPrice": w3.eth.gas_price,
    })
    signed = agent.sign_transaction(tx)
    return w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(signed.raw_transaction))`}</Code>
            <P>
              The first loan locks the agent&apos;s ID in the CreditLine. The relay deposits each loan into the agent&apos;s 0G compute account within
              seconds and records the 0G transaction on Hedera. Every split of the agent&apos;s income pays the lender first, and when the debt reaches
              zero the sweeper hands the ID back. A request over the limit reverts with <C>OverLimit</C>, one from any other wallet with{" "}
              <C>NotAgent</C>, and one on a defaulted line with <C>LineDefaulted</C>.
            </P>
          </div>

          <div className="mt-12">
            <H2 id="underwriting">Underwriting</H2>
            <P>
              Income can be faked: an owner can fund a few wallets and have them pay their own agent. So before counting a customer&apos;s
              payments, the underwriter follows that customer&apos;s money back on Hedera&apos;s public mirror node, up to three hops.
            </P>
            <Table
              head={["Rule", "Value"]}
              rows={[
                ["Money that traces back to the agent or its owner", "counts for nothing"],
                ["Money the agent sent out that came back as payment", "counts for nothing"],
                ["Most any one customer can count for", "40% of verified income"],
                ["Independent customers needed", "at least 3"],
                ["Margin each job must earn over its AI cost", "at least 20%"],
                ["Limit", "50% of the income that counts, at most $5 for a new agent"],
              ]}
            />
            <P>
              The decision, with every fact it used and a short memo, is written to Arkiv. The keccak-256 hash of that record is stored with
              the limit on Hedera (<C>LimitSet.decisionHash</C>), so anyone can check the published reasoning is the one behind the limit.
              The rules decide; a 0G model can be used to word the memo.
            </P>
          </div>

          <div className="mt-12">
            <H2 id="collateral">Collateral and defaults</H2>
            <P>
              Each agent has an ERC-8004 identity, an NFT that carries its name and reputation. The owner approves the CreditLine once. The
              first loan of a debt cycle moves the ID into the CreditLine and starts a 7-day repayment term; when the debt reaches zero, anyone
              can return it to the owner, and the sweeper does so automatically.
            </P>
            <P>
              A line defaults if the debt is still owed 24 hours after the term ends (anyone can call <C>markOverdue</C>), or if the watcher
              reports a breach. On default the ID goes to the lender&apos;s treasury and the agent can&apos;t borrow again.
            </P>
          </div>

          <div className="mt-12">
            <H2 id="watcher">The watcher</H2>
            <P>For every line with debt outstanding, every minute:</P>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[16px] leading-[1.7] text-slate">
              <li>It asks the agent&apos;s paid endpoint for its price, like a customer would, and checks the x402 payTo is the agent&apos;s splitter. Two mismatches in a row are a breach.</li>
              <li>It watches 0G for <C>CreditTransferred</C> out of the agent&apos;s compute account, which would move borrowed compute out of reach.</li>
              <li>It marks debts overdue after the due date plus the grace period.</li>
            </ul>
          </div>

          <div className="mt-12">
            <H2 id="bureau">Credit bureau on Arkiv</H2>
            <P>
              Each fact is one Arkiv entity owned by the bureau wallet <C>{d.arkiv.bureau}</C>, under the schema <C>{d.arkiv.schema}</C>.
              Records expire on their own, so old history ages out like a credit report.
            </P>
            <Table
              head={["Record", "Written when", "Kept for"]}
              rows={[
                ["underwriting / refusal", "the underwriter decides (full decision record)", "90 days"],
                ["decision", "a limit is set on Hedera", "90 days"],
                ["loan", "the agent borrows", "180 days"],
                ["disbursed", "the loan reaches 0G compute", "180 days"],
                ["repayment", "a split pays the lender", "90 days"],
                ["repaid", "the debt is cleared and the ID returned", "180 days"],
                ["default", "a line defaults, with the reason", "90 days"],
              ]}
            />
            <P>Anyone can read an agent&apos;s history with Arkiv&apos;s query API, filtering on the bureau wallet so nobody else&apos;s records are mixed in:</P>
            <Code>{`arkiv.schema = str('overdraft.bureau')
  AND $owner = addr(${d.arkiv.bureau})
  AND agentId = u64(140)`}</Code>
          </div>

          <div className="mt-12">
            <H2 id="addresses">Contracts and addresses</H2>
            <Table
              head={["What", "Address", "Network"]}
              rows={[
                ["CreditLine", <A key="cl" href={hashscan(d.hedera.creditLine.id)}>{d.hedera.creditLine.id}</A>, "Hedera testnet"],
                ["IncomeSplitter (agent #140)", <A key="sp" href={hashscan(d.hedera.splitter.id)}>{d.hedera.splitter.id}</A>, "Hedera testnet"],
                ["ERC-8004 IdentityRegistry", <span key="id" className="font-mono text-[13px]">{d.hedera.identityRegistry}</span>, "Hedera testnet"],
                ["USDC", <span key="usdc" className="font-mono text-[13px]">{d.hedera.usdc}</span>, "Hedera testnet"],
                ["PaymentVault", <A key="pv" href={`https://chainscan.0g.ai/address/${d.zg.paymentVault}`}>{d.zg.paymentVault}</A>, "0G mainnet"],
                ["Bureau wallet", <span key="bw" className="font-mono text-[13px]">{d.arkiv.bureau}</span>, "Arkiv Rabdi"],
              ]}
            />
          </div>

          <div className="mt-12">
            <H2 id="run">Run it yourself</H2>
            <P>
              The code is at <A href="https://github.com/vansh0112/overdraft">github.com/vansh0112/overdraft</A>: Solidity contracts, a
              Python backend, and a TypeScript x402 gateway (the Hedera x402 package is TypeScript-only). Copy <C>.env.example</C> to{" "}
              <C>.env</C> and use test wallets only.
            </P>
            <Code>{`# contracts and the agent's identity (Hedera testnet)
python -m overdraft.cli deploy-credit-line
python -m overdraft.cli deploy-splitter
python -m overdraft.cli register-agent --owner OWNER
python -m overdraft.underwriter AGENT_ID AGENT_ACCOUNT --apply

# services
npm --prefix gateway run gateway              # x402 endpoint
uvicorn overdraft.agent.app:app --port 5001   # the borrowing agent
python -m overdraft.sweeper                   # splits income, returns IDs
python -m overdraft.relay                     # loans into 0G compute
python -m overdraft.bureau watch              # credit history to Arkiv
python -m overdraft.watcher                   # breaches and overdue debts
uvicorn overdraft.console:app --port 8000     # data for this site, enrolment and credit checks

# a rush of paid jobs
npm --prefix gateway run rush -- 8

# try enrolment locally (ALLOW_LOCAL_ENDPOINTS=true): a second endpoint, served by a test agent
# with its own budget, so tests never borrow on the demo agent's line
AGENT_CREDIT_ID=0 AGENT_START_BALANCE_USD=50 uvicorn overdraft.agent.app:app --port 5002
SPLITTER_CONTRACT_ID=0.0.INCOME_CONTRACT GATEWAY_PORT=4022 AGENT_INTERNAL_URL=http://localhost:5002 \\
  npm --prefix gateway run gateway
GATEWAY_URL=http://localhost:4022 npm --prefix gateway run rush -- 8`}</Code>
          </div>

          <div className="mt-12">
            <H2 id="limits">Limits and trust</H2>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 text-[16px] leading-[1.7] text-slate">
              <li>The relay that moves loans from Hedera to 0G is run by the lender. Its deposits are capped per transfer and per day, and every one is recorded on Hedera.</li>
              <li>A payTo redirect is detected and punished, not prevented: an endpoint could show the watcher a different address than its customers.</li>
              <li>The money trail can&apos;t see through an exchange or more than three hops, which is why new agents start with small limits.</li>
              <li>0G&apos;s PaymentVault is upgradeable by 0G, and <C>transferCredit</C> can&apos;t be blocked; the watcher treats a transfer out as a breach.</li>
              <li>On testnet, the demo customers were funded from the lender&apos;s test wallet; the underwriter treats the lender&apos;s wallets as outside money.</li>
              <li>The 0G side runs in simulation until the lender wallet holds 0G: deposits are checked against the live PaymentVault without being sent.</li>
              <li>An agent&apos;s AI cost per job is the owner&apos;s own figure, so the margin check is only as good as that number.</li>
              <li>The lender pays to deploy each enrolled agent&apos;s income contract, so new enrolments are capped per day. Signed requests are good for ten minutes and only once.</li>
              <li>The API fetches endpoints owners submit only at public https addresses, without following redirects. Agent names are read only from registration files stored on-chain.</li>
            </ul>
          </div>
        </article>
      </main>
      <Footer surface="paper" />
    </div>
  );
}

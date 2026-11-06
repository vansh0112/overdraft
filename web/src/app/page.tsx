import Link from "next/link";
import { Footer, Nav } from "@/components/brand";
import { BudgetChart } from "@/components/landing/BudgetChart";
import { LiveStrip } from "@/components/landing/LiveStrip";

const steps = [
  {
    title: "Prove your income",
    where: "Hedera mirror node · Arkiv",
    body: "Before lending, we trace where each customer's money came from, up to three hops back. Payments funded by the agent or its owner count for nothing. The limit and every fact behind it are published.",
  },
  {
    title: "Borrow compute, not cash",
    where: "0G compute",
    body: "Loans are paid straight into the agent's 0G compute account. Money there can only be spent on AI, so a loan can't be cashed out and spent on something else.",
  },
  {
    title: "Repay from income",
    where: "x402 on Hedera",
    body: "Customers pay per job with x402, into a contract that splits every payment. The lender is paid first, a share tops up compute, and the rest goes to the owner.",
  },
  {
    title: "Your ID is the collateral",
    where: "ERC-8004",
    body: "The agent's on-chain identity is held while it owes and handed back when it repays. If it cheats or doesn't repay, the lender keeps it, along with the reputation attached to it.",
  },
];

const whyChain = [
  {
    title: "Money that can only become compute",
    body: "0G's payment vault has no withdraw button for the agent. That's what makes lending to software safe: the loan can't leave as cash.",
  },
  {
    title: "Repayment nobody can skip",
    body: "Income arrives at a contract, not the agent's wallet. The contract pays the lender before anyone else, without asking the agent.",
  },
  {
    title: "A credit history anyone can check",
    body: "Every decision, loan and repayment is recorded on Arkiv, with a fingerprint on Hedera. Records delete themselves after 90 to 180 days, like an old entry on a credit report.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-paper text-ink">
      <Nav surface="paper" />
      <main className="flex-1">
        <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pt-24">
          <div>
            <div className="font-mono text-[12px] uppercase tracking-[0.1em] text-slate">Credit lines for AI agents</div>
            <h1 className="mt-5 font-serif text-[56px] leading-[0.95] tracking-[-0.015em] sm:text-[76px]">
              Never turn away <em className="text-signal">paid work.</em>
            </h1>
            <p className="mt-6 max-w-[520px] text-[18px] leading-relaxed text-slate">
              When orders arrive faster than an agent&apos;s AI budget, Overdraft lends it compute on 0G. Its own earnings on Hedera pay the
              loan back, automatically.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/console" className="rounded-xl bg-ink px-5 py-3 text-[15px] font-semibold text-paper transition hover:bg-ink-3">
                Open the live console
              </Link>
              <a href="#how" className="rounded-xl border border-ink px-5 py-3 text-[15px] font-semibold text-ink transition hover:bg-paper-2">
                How it works
              </a>
            </div>
          </div>
          <BudgetChart />
        </section>

        <section className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <LiveStrip />
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <h2 className="font-serif text-[40px] leading-[1.02] sm:text-[48px]">A rush of orders shouldn&apos;t be a problem.</h2>
            <div className="grid gap-6 text-[16px] leading-relaxed text-slate sm:grid-cols-3">
              <p>
                <span className="block font-semibold text-ink">Orders pile up.</span>A translation agent gets ten paid jobs in a minute
                instead of one.
              </p>
              <p>
                <span className="block font-semibold text-ink">The budget runs dry.</span>Each job needs AI compute, paid upfront. Its balance
                covers two.
              </p>
              <p>
                <span className="block font-semibold text-ink">Paid work is lost.</span>Without credit, it turns eight paying customers away.
                With Overdraft, it borrows the gap and serves all ten.
              </p>
            </div>
          </div>
        </section>

        <section id="how" className="bg-ink text-paper">
          <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
            <div className="font-mono text-[12px] uppercase tracking-[0.1em] text-fog">How it works</div>
            <h2 className="mt-4 max-w-2xl font-serif text-[40px] leading-[1.02] sm:text-[48px]">Credit that runs itself, from limit to repayment.</h2>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-ink-line bg-ink-line md:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <li key={s.title} className="bg-ink-2 p-6">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] text-signal">0{i + 1}</span>
                    <span className="text-[12px] text-fog">{s.where}</span>
                  </div>
                  <h3 className="mt-6 font-serif text-[26px] leading-tight">{s.title}</h3>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-fog">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <div className="font-mono text-[12px] uppercase tracking-[0.1em] text-slate">Fake earnings don&apos;t count</div>
              <h2 className="mt-4 font-serif text-[40px] leading-[1.02] sm:text-[48px]">We follow the money before we lend it.</h2>
              <p className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-slate">
                An owner can fund a few wallets and have them &ldquo;pay&rdquo; their own agent, so it looks busy. Our underwriter traces each
                customer&apos;s money back through the chain. When it leads to the owner, that income is ignored.
              </p>
              <p className="mt-4 max-w-[520px] text-[16px] leading-relaxed text-slate">
                It raises the cost of faking rather than making it impossible, so new agents also start with small limits.
              </p>
            </div>
            <div className="rounded-2xl border border-paper-line bg-paper-2/60 p-6">
              <div className="flex items-center justify-between text-[12px] text-slate">
                <span className="font-mono uppercase tracking-[0.08em]">Agent #142 applies for credit</span>
                <span className="rounded-full border border-signal px-2.5 py-1 font-semibold text-signal">Refused</span>
              </div>
              <ul className="mt-5 space-y-3 font-mono text-[13px]">
                {[
                  { from: "customer 0.0.11330357", trail: ["owner"], verdict: "funded by the owner" },
                  { from: "customer 0.0.11330358", trail: ["owner"], verdict: "funded by the owner" },
                  { from: "customer 0.0.11330359", trail: ["middleman", "owner"], verdict: "via a middleman" },
                  { from: "customer 0.0.11324428", trail: [], verdict: "independent" },
                ].map((row) => (
                  <li key={row.from} className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-line pb-3">
                    <span>
                      {row.from}
                      {row.trail.map((t) => (
                        <span key={t}>
                          <span className="px-1.5 text-signal">←</span>
                          <span className={t === "owner" ? "text-signal" : ""}>{t}</span>
                        </span>
                      ))}
                    </span>
                    <span className={row.trail.length ? "text-signal" : "text-slate"}>{row.verdict}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[14px] text-slate">
                89% of its income came from its owner&apos;s own money. Only one real customer, so no credit. The refusal is public on Arkiv.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-paper-line">
          <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
            <div className="font-mono text-[12px] uppercase tracking-[0.1em] text-slate">Why this needs a blockchain</div>
            <div className="mt-8 grid gap-8 md:grid-cols-3">
              {whyChain.map((w) => (
                <div key={w.title}>
                  <h3 className="font-serif text-[28px] leading-tight">{w.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-slate">{w.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-ink p-8 text-paper sm:p-12 lg:flex-row lg:items-end">
            <div>
              <h2 className="font-serif text-[40px] leading-none sm:text-[52px]">
                Watch it <em className="text-signal">borrow and repay</em>, live.
              </h2>
              <p className="mt-4 max-w-xl text-[16px] text-fog">Every number in the console is read from Hedera and Arkiv, and from 0G once its loans go live. Every step links to its transaction.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/console" className="rounded-xl bg-signal px-5 py-3 text-[15px] font-semibold text-ink transition hover:brightness-110">
                Open the console
              </Link>
              <Link href="/docs" className="rounded-xl border border-ink-line px-5 py-3 text-[15px] font-semibold text-paper transition hover:border-fog">
                Read the docs
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer surface="paper" />
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Footer, Nav } from "@/components/brand";
import { Guarantees } from "@/components/landing/Guarantees";
import { HeroTerminal } from "@/components/landing/HeroTerminal";
import { LiveBadge, NetworkStats } from "@/components/landing/Live";
import { RushPipeline } from "@/components/landing/RushPipeline";
import { Scramble } from "@/components/system/Scramble";
import { DEPLOYMENTS } from "@/lib/deployments";

const demo = `/agents/${DEPLOYMENTS.demoAgentId}`;

function SectionHead({ index, eyebrow, title, text }: { index: string; eyebrow: string; title: string; text: string }) {
  return (
    <div className="reveal grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] md:items-end">
      <div>
        <div className="flex items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.14em] text-faint">
          <span className="text-accent">{index}</span>
          <span className="h-px w-8 bg-line-2" aria-hidden="true" />
          {eyebrow}
        </div>
        <h2 className="display mt-4 text-[36px] sm:text-[52px]">{title}</h2>
      </div>
      <p className="max-w-md text-[15.5px] leading-relaxed text-muted md:justify-self-end">{text}</p>
    </div>
  );
}

/** The mark's dip-and-recover line, drawn huge and faint behind the hero. */
function HeroCurve() {
  return (
    <svg viewBox="0 0 1600 640" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" aria-hidden="true">
      <path
        className="draw-path"
        d="M-20 250 H 420 C 560 250, 600 470, 760 470 S 1000 150, 1160 150 H 1640"
        fill="none"
        stroke="var(--line-2)"
        strokeWidth="1.5"
        pathLength={1}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx="760" cy="470" r="5" fill="var(--accent)" className="draw-dot" />
    </svg>
  );
}

const ENROL_STEPS = ["Register the agent's ERC-8004 ID", "Approve the ID as collateral", "Sign the application with your wallet", "Pass a credit check on real income", "Borrow from code when work piles up"];

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas text-fg">
      <Nav />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="dots fade-edges pointer-events-none absolute inset-0" aria-hidden="true" />
          <HeroCurve />
          <div className="relative mx-auto grid max-w-[1240px] items-center gap-14 px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:gap-12 lg:pb-28 lg:pt-24">
            <div>
              <div className="enter">
                <LiveBadge />
              </div>
              <h1 className="display enter enter-1 mt-6 text-[44px] sm:text-[66px] lg:text-[74px]">
                Credit for AI agents that never turn away <Scramble text="paid work." className="text-accent" />
              </h1>
              <p className="enter enter-2 mt-6 max-w-[520px] text-[17px] leading-relaxed text-muted">
                When orders arrive faster than an agent&apos;s AI budget, Overdraft lends it the compute. What its customers pay repays the loan automatically, and its on-chain ID is the collateral.
              </p>
              <div className="enter enter-3 mt-8 flex flex-wrap gap-3">
                <Link href={demo} className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-fg px-5 sm:w-auto text-[15px] font-semibold text-canvas transition hover:opacity-90">
                  Watch an agent borrow <ArrowRight size={16} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
                <Link href="/enrol" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line-2 bg-surface/60 sm:w-auto px-5 text-[15px] font-semibold backdrop-blur transition hover:border-faint">
                  Enrol your agent
                </Link>
              </div>
              <div className="enter enter-4 mt-12 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] text-faint">
                <span className="uppercase tracking-[0.14em]">Built on</span>
                {["Hedera", "0G", "Arkiv", "ERC-8004", "x402"].map((n) => (
                  <span key={n} className="text-muted">
                    {n}
                  </span>
                ))}
              </div>
            </div>
            <div className="enter enter-2">
              <HeroTerminal />
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-line">
          <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6 sm:py-28">
            <SectionHead index="01" eyebrow="How it works" title="One rush, start to finish." text="A minute in the life of an agent with a credit line. The demo agent does this on testnet, and every step is a transaction you can open." />
            <div className="reveal mt-12">
              <RushPipeline />
            </div>
          </div>
        </section>

        <section id="safety" className="border-t border-line bg-canvas-2">
          <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6 sm:py-28">
            <SectionHead index="02" eyebrow="Safe by construction" title="Lending to software, without trusting it." text="Three rules the contracts enforce, and one check before any credit is given. Nobody has to take the agent's word for anything." />
            <div className="mt-12">
              <Guarantees />
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-line">
          <div className="dots fade-edges pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="glow pointer-events-none absolute -right-40 top-10 h-[520px] w-[520px]" aria-hidden="true" />
          <div className="relative mx-auto max-w-[1240px] px-4 py-20 sm:px-6 sm:py-28">
            <div className="reveal">
              <NetworkStats />
            </div>
            <div className="mt-16 grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <div className="reveal">
                <div className="flex items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.14em] text-faint">
                  <span className="text-accent">03</span>
                  <span className="h-px w-8 bg-line-2" aria-hidden="true" />
                  Get started
                </div>
                <h2 className="display mt-4 text-[40px] sm:text-[60px]">Give your agent a credit line.</h2>
                <p className="mt-5 max-w-md text-[16px] leading-relaxed text-muted">Any ERC-8004 agent on Hedera testnet can apply. No account to create: your wallet signs everything, and the agent borrows from a few lines of code.</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/enrol" className="group inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-semibold text-accent-ink transition hover:brightness-110">
                    Enrol an agent <ArrowRight size={16} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                  <Link href="/docs" className="inline-flex h-12 items-center rounded-xl border border-line-2 px-5 text-[15px] font-semibold transition hover:border-faint">
                    Read the docs
                  </Link>
                </div>
              </div>
              <ol className="reveal overflow-hidden rounded-3xl border border-line bg-surface">
                {ENROL_STEPS.map((step, i) => (
                  <li key={step} className="group flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0 sm:px-6">
                    <span className="font-mono text-[11px] text-faint">0{i + 1}</span>
                    <span className="flex-1 text-[14.5px]">{step}</span>
                    <span
                      className="tick grid h-6 w-6 place-items-center rounded-full border border-line-2 text-faint"
                      style={{ animationDelay: `${0.25 + i * 0.22}s` }}
                      aria-hidden="true"
                    >
                      <Check size={13} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

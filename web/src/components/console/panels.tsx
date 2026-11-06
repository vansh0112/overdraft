import { Check, Cpu, Lock, LockOpen, ShieldExclamationPoint } from "lucide-react";
import type { ActivityEvent, AgentStatus, Compute, Contracts, Line } from "@/lib/api";
import { ago, date, short, usd } from "@/lib/format";
import { Card, ExtLink, Label, Pill, SectionTitle } from "./ui";

const STAGES: Record<Line["stage"], { label: string; tone: "quiet" | "outline" | "neutral" | "ok" }> = {
  approved: { label: "Active", tone: "ok" },
  enrolled: { label: "Enrolled · no credit yet", tone: "neutral" },
  refused: { label: "Refused", tone: "outline" },
  "no-credit": { label: "No credit", tone: "quiet" },
  defaulted: { label: "Defaulted", tone: "outline" },
};

/** Where a line stands, for any agent summary that carries a stage. */
export function StagePill({ stage }: { stage: Line["stage"] }) {
  const { label, tone } = STAGES[stage] ?? STAGES["no-credit"];
  return <Pill tone={tone}>{label}</Pill>;
}

/** Where the agent's ERC-8004 ID is: locked while it owes, back with its owner, or kept after a default. */
export function CollateralPill({ heldBy }: { heldBy: Line["collateral"]["heldBy"] }) {
  const collateral = {
    creditLine: { icon: <Lock size={12} />, label: "ID locked as collateral", tone: "signal" as const },
    owner: { icon: <LockOpen size={12} />, label: "ID with its owner", tone: "quiet" as const },
    treasury: { icon: <ShieldExclamationPoint size={12} />, label: "ID taken by the lender", tone: "outline" as const },
  }[heldBy];
  return (
    <Pill tone={collateral.tone}>
      {collateral.icon}
      {collateral.label}
    </Pill>
  );
}

export function UsageBar({ line }: { line: Line }) {
  const used = line.limitUsd > 0 ? Math.min(1, line.owedUsd / line.limitUsd) : 0;
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${Math.round(used * 100)}% of the limit in use`}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-700" style={{ width: `${used * 100}%` }} />
      <div className="absolute inset-y-0 right-0 rounded-full bg-ok/25 transition-[width] duration-700" style={{ width: `${(1 - used) * 100}%` }} />
    </div>
  );
}

/** What the agent owed after each loan and repayment, as a step chart against its limit. */
function DebtChart({ events, line }: { events: ActivityEvent[]; line: Line }) {
  const points = events
    .filter((e) => e.owedAfterUsd !== undefined && (e.kind === "loan" || e.kind === "split"))
    .slice(0, 28)
    .reverse()
    .map((e) => e.owedAfterUsd as number);
  points.push(line.owedUsd);
  if (points.length < 3) {
    return <div className="grid h-full min-h-[120px] place-items-center rounded-xl border border-dashed border-line text-[12.5px] text-faint">The debt chart starts with the first loan</div>;
  }
  const W = 600;
  const H = 130;
  const top = Math.max(line.limitUsd, ...points) || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 6 - (v / top) * (H - 18);
  let d = `M0 ${y(points[0])}`;
  points.forEach((v, i) => {
    if (i === 0) return;
    d += ` H${x(i)} V${y(v)}`;
  });
  const area = `${d} V${H} H0 Z`;
  const last = points[points.length - 1];
  return (
    <div className="relative h-full min-h-[130px]">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="debt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".35" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={y(line.limitUsd)} y2={y(line.limitUsd)} stroke="var(--line-2)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="url(#debt-fill)" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <span className="absolute right-0 font-mono text-[10px] text-faint" style={{ top: `calc(${(y(line.limitUsd) / H) * 100}% - 15px)` }}>
        limit {usd(line.limitUsd)}
      </span>
      <span className="absolute right-0 -translate-y-1/2 translate-x-1/2" style={{ top: `${(y(last) / H) * 100}%` }} aria-hidden="true">
        <span className={`status-dot block ${last > 0 ? "text-accent" : "text-ok"}`} />
      </span>
    </div>
  );
}

export function CreditLineCard({ line, events }: { line: Line; events: ActivityEvent[] | null }) {
  const defaulted = line.status === "defaulted";
  const used = line.limitUsd > 0 ? Math.round((line.owedUsd / line.limitUsd) * 100) : 0;
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <Label>Credit line</Label>
        <div className="flex flex-wrap gap-2">
          <StagePill stage={line.stage} />
          <CollateralPill heldBy={line.collateral.heldBy} />
        </div>
      </div>
      <div className="grid flex-1 gap-6 px-5 pb-5 pt-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col">
          <div className="text-[12.5px] text-muted">Owed now</div>
          <div className={`tabular mt-1 text-[48px] font-semibold leading-none tracking-[-0.05em] sm:text-[60px] ${line.owedUsd > 0 ? "text-accent" : "text-fg"}`}>{usd(line.owedUsd)}</div>
          <div className="mt-2 text-[13px] text-muted">
            of a <span className="font-mono text-fg">{usd(line.limitUsd)}</span> limit · {used}% used
          </div>
          <div className="mt-5">
            <UsageBar line={line} />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <dt className="text-[12px] text-muted">Available</dt>
              <dd className="tabular mt-1 font-mono text-[18px] font-semibold text-ok">{defaulted ? "closed" : usd(line.availableUsd)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Loans</dt>
              <dd className="tabular mt-1 font-mono text-[18px] font-semibold">{line.loans.length}</dd>
            </div>
          </dl>
        </div>
        {events ? <DebtChart events={events} line={line} /> : <div className="skeleton min-h-[130px] rounded-xl" />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas-2/50 px-5 py-3 text-[12px] text-muted">
        <span>
          {defaulted
            ? "Defaulted: the lender kept the ID and closed the line"
            : line.owedUsd > 0 && line.dueAt
              ? `Due ${date(line.dueAt)} · repaid automatically from income`
              : line.stage === "enrolled"
                ? "Enrolled: waiting for its first credit check"
                : line.stage === "refused" && line.reason
                  ? `Refused: ${line.reason}`
                  : "Nothing owed"}
        </span>
        <ExtLink href={line.splitter.url} className="font-mono">
          splitter {line.splitter.id}
        </ExtLink>
      </div>
    </Card>
  );
}

/** The job queue as blocks: green ones the budget covers, orange ones that need credit. */
function Queue({ waiting, covers }: { waiting: number; covers: number }) {
  const shown = Math.min(waiting, 16);
  if (shown === 0) {
    return (
      <div className="flex gap-1" aria-label="No jobs waiting">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="h-5 flex-1 rounded-[4px] border border-dashed border-line" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-1" role="img" aria-label={`${waiting} jobs waiting, the budget covers ${Math.min(covers, waiting)}`}>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className={`h-5 flex-1 rounded-[4px] ${i < covers ? "bg-ok/70" : "bg-accent/80"}`} style={{ animation: `rise .3s ${i * 0.03}s both` }} />
      ))}
    </div>
  );
}

export function ComputeCard({ status, online }: { status: AgentStatus | null; online: boolean }) {
  if (!status) {
    return (
      <Card className="flex flex-col p-5">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-faint" />
          <Label>AI compute</Label>
        </div>
        <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
          {online ? "The agent's live status shows here while it runs." : "The agent is offline right now. Everything else on this page is read from the chains and stays live."}
        </p>
      </Card>
    );
  }
  const live = status.computeMode === "0g";
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-faint" />
          <Label>AI compute</Label>
        </div>
        <Pill tone={live ? "neutral" : "quiet"}>{live ? "0G mainnet" : "0G simulated"}</Pill>
      </div>
      <div className="mt-5 text-[12.5px] text-muted">Budget</div>
      <div className="tabular mt-1 font-mono text-[34px] font-semibold leading-none tracking-[-0.03em]">{usd(status.balanceUsd)}</div>
      <div className="mt-1.5 text-[12.5px] text-muted">
        covers {status.coversJobs} job{status.coversJobs === 1 ? "" : "s"} · {usd(status.costPerJobUsd, 4)} per job
      </div>
      <div className="mt-auto pt-6">
        <div className="mb-2 flex items-baseline justify-between text-[12.5px]">
          <span className="text-muted">Jobs waiting</span>
          <span className={`font-mono font-semibold ${status.waiting > 0 ? "text-accent" : "text-fg"}`}>{status.waiting}</span>
        </div>
        <Queue waiting={status.waiting} covers={status.coversJobs} />
        <div className="mt-2 font-mono text-[11px] text-faint">{status.served} served since start</div>
      </div>
    </Card>
  );
}

/** Any agent's AI budget, read straight from its compute account in the 0G PaymentVault. */
export function VaultComputeCard({ compute }: { compute: Extract<Compute, { source: "0g-vault" }> | null }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-faint" />
          <Label>AI compute</Label>
        </div>
        <Pill tone="neutral">0G mainnet</Pill>
      </div>
      {compute ? (
        <>
          <div className="mt-5 text-[12.5px] text-muted">Budget</div>
          <div className="tabular mt-1 font-mono text-[34px] font-semibold leading-none tracking-[-0.03em]">{usd(compute.balanceUsd)}</div>
          <div className="mt-1.5 text-[12.5px] text-muted">{compute.balance0G.toFixed(4)} 0G in its compute account</div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-muted">Read live from the 0G PaymentVault. Only agents that publish their status also show jobs waiting.</p>
          <div className="mt-auto pt-4 text-[12px]">
            <ExtLink href={compute.url}>account {short(compute.account)} on 0G</ExtLink>
          </div>
        </>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="skeleton h-9 w-32 rounded-lg" />
          <div className="skeleton h-4 w-48 rounded" />
        </div>
      )}
    </Card>
  );
}

type Step = { title: string; where: string; value: string; detail: string; url?: string; urlLabel?: string; done: boolean };

/**
 * The six real steps of one loan cycle, each showing its latest on-chain event. `reportsJobs` is true for an agent
 * that publishes its own status (the demo agent); other agents' job counts aren't public.
 */
export function Loop({
  events,
  line,
  status,
  computeMode,
  reportsJobs,
}: {
  events: ActivityEvent[];
  line: Line;
  status: AgentStatus | null;
  computeMode?: Contracts["computeMode"];
  reportsJobs: boolean;
}) {
  const latest = (kind: ActivityEvent["kind"]) => events.find((e) => e.kind === kind);
  const payments = events.filter((e) => e.kind === "payment");
  const payment = payments[0];
  const loan = latest("loan");
  const deposit = latest("deposit");
  const split = latest("split");
  const released = latest("released");
  const lastLoan = line.loans[line.loans.length - 1];
  const zgLive = (status?.computeMode ?? computeMode) === "0g";
  const served = status?.events.find((e) => e.kind === "served");

  const steps: Step[] = [
    {
      title: "Customers pay",
      where: "x402 · Hedera",
      value: payment ? `${payments.length} payments` : "None yet",
      detail: payment ? `latest ${usd(payment.amountUsd)} ${ago(payment.at)}` : "each job is paid in USDC",
      url: payment?.url,
      done: Boolean(payment),
    },
    {
      title: "Borrows",
      where: "CreditLine · Hedera",
      value: loan ? usd(loan.amountUsd) : "No loans yet",
      detail: loan ? `owed ${usd(loan.owedAfterUsd)} after · ${ago(loan.at)}` : "only when jobs outrun the budget",
      url: loan?.url,
      done: Boolean(loan),
    },
    {
      title: "Into compute",
      where: zgLive ? "PaymentVault · 0G" : "0G · simulated",
      value: deposit?.simulated ? `${deposit.amount0G?.toFixed(3)} 0G` : deposit ? "Deposited" : lastLoan && !lastLoan.zgTx ? (zgLive ? "Depositing" : "Simulated") : "Waiting",
      detail: deposit?.simulated
        ? `dry run: ${deposit.balanceBefore0G?.toFixed(3)} → ${deposit.balanceAfter0G?.toFixed(3)} 0G · ${ago(deposit.at)}`
        : deposit
          ? `loan #${deposit.drawId} · ${ago(deposit.at)}`
          : zgLive
            ? "the relay deposits each loan on 0G"
            : "a dry run on 0G's live vault; nothing is spent",
      url: deposit?.url,
      urlLabel: deposit?.simulated ? "vault" : undefined,
      done: Boolean(deposit),
    },
    {
      title: "Serves jobs",
      where: !reportsJobs ? "the agent's own AI" : zgLive ? "0G inference" : "simulated AI",
      value: status ? `${status.served} served` : reportsJobs ? "Offline" : "Not reported",
      detail: served ? served.detail : reportsJobs ? "every paid job is served or refunded" : "this agent doesn't publish its job count",
      done: Boolean(status?.served),
    },
    {
      title: "Income splits",
      where: "IncomeSplitter · Hedera",
      value: split ? usd(split.amountUsd ?? (split.toLenderUsd ?? 0) + (split.toComputeUsd ?? 0) + (split.toOwnerUsd ?? 0)) : "None yet",
      detail: split ? `lender ${usd(split.toLenderUsd)} · compute ${usd(split.toComputeUsd)} · owner ${usd(split.toOwnerUsd)}` : "lender, compute and owner shares",
      url: split?.url,
      done: Boolean(split),
    },
    {
      title: "Repaid",
      where: "debt on the splitter",
      value: line.status === "defaulted" ? "Defaulted" : line.loans.length === 0 ? "No loans yet" : line.owedUsd === 0 ? "Paid off" : `${usd(line.owedUsd)} left`,
      detail:
        line.status === "defaulted"
          ? `${usd(line.owedUsd)} unpaid · the lender kept the ID`
          : line.owedUsd === 0 && released
            ? `ID returned ${ago(released.at)}`
            : "each split pays the lender first",
      url: line.owedUsd === 0 ? released?.url : undefined,
      done: line.status === "active" && line.loans.length > 0 && line.owedUsd === 0,
    },
  ];

  return (
    <Card>
      <SectionTitle title="The loan cycle" hint="Six real steps. Each one shows its latest on-chain event and links to it." />
      <ol className="grid px-5 pb-5 pt-6 lg:grid-cols-6">
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          const color = step.done ? (last ? "border-ok bg-ok text-accent-ink" : "border-accent bg-accent text-accent-ink") : "border-line-2 bg-surface text-faint";
          return (
            <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0 lg:block lg:pb-0 lg:pr-4">
              {!last && (
                <span
                  className={`absolute left-[13px] top-7 bottom-0 w-px lg:left-8 lg:right-1 lg:top-[13px] lg:h-px lg:w-auto ${step.done ? "bg-accent/60" : "bg-line-2"}`}
                  aria-hidden="true"
                />
              )}
              <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-[10.5px] font-semibold transition-colors duration-500 ${color}`}>
                {step.done ? <Check size={13} strokeWidth={3} /> : `0${i + 1}`}
              </span>
              <div className="min-w-0 lg:mt-4">
                <div className="flex items-baseline gap-2 lg:block">
                  <div className="text-[14px] font-semibold">{step.title}</div>
                  <div className="font-mono text-[10.5px] text-faint lg:mt-0.5">{step.where}</div>
                </div>
                <div className="tabular mt-2 font-mono text-[16px] font-semibold">{step.value}</div>
                <div className="mt-1 text-[12px] leading-snug text-muted">{step.detail}</div>
                {step.url && (
                  <div className="mt-2 text-[12px]">
                    <ExtLink href={step.url}>{step.urlLabel ?? "transaction"}</ExtLink>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

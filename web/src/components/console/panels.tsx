import { Cpu, Lock, LockOpen, ShieldExclamationPoint } from "lucide-react";
import type { ActivityEvent, AgentStatus, Compute, Contracts, Line } from "@/lib/api";
import { ago, date, short, usd } from "@/lib/format";
import { Card, ExtLink, Pill, Stat } from "./ui";

/** Where the agent's ERC-8004 ID is: locked while it owes, back with its owner, or kept after a default. */
export function CollateralPill({ heldBy }: { heldBy: Line["collateral"]["heldBy"] }) {
  const collateral = {
    creditLine: { icon: <Lock size={13} />, label: "ID locked as collateral", tone: "signal" as const },
    owner: { icon: <LockOpen size={13} />, label: "ID with its owner", tone: "neutral" as const },
    treasury: { icon: <ShieldExclamationPoint size={13} />, label: "ID taken by the lender", tone: "outline" as const },
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
    <div className="h-1.5 overflow-hidden rounded-full bg-ink-line" role="img" aria-label={`${Math.round(used * 100)}% of the limit in use`}>
      <div className="h-full rounded-full bg-signal transition-[width] duration-700" style={{ width: `${used * 100}%` }} />
    </div>
  );
}

export function CreditLineCard({ line, termSeconds }: { line: Line; termSeconds?: number }) {
  const defaulted = line.status === "defaulted";
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] text-fog">
          <span>Credit line</span>
          <span aria-hidden="true">·</span>
          <ExtLink href={line.splitter.url}>repays through splitter {line.splitter.id}</ExtLink>
        </div>
        <div className="flex gap-2">
          {defaulted ? <Pill tone="outline">Defaulted</Pill> : <Pill tone="quiet">Active</Pill>}
          <CollateralPill heldBy={line.collateral.heldBy} />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4">
        <Stat label="Limit" value={usd(line.limitUsd)} sub="set from verified income" />
        <Stat label="Owed" value={usd(line.owedUsd)} sub={`includes the ${termSeconds ? "flat " : ""}5% fee`} accent={line.owedUsd > 0} />
        <Stat label="Available" value={usd(line.availableUsd)} sub={defaulted ? "closed after default" : "to borrow now"} />
      </div>
      <div className="mt-5">
        <UsageBar line={line} />
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-[12px] text-fog">
        <span>
          {defaulted
            ? "Defaulted: the lender kept the ID and closed the line"
            : line.owedUsd > 0 && line.dueAt
              ? `Due ${date(line.dueAt)} · repaid automatically from income`
              : "Nothing owed"}
        </span>
        <span className="font-mono">{line.loans.length} loan{line.loans.length === 1 ? "" : "s"} on this line</span>
      </div>
    </Card>
  );
}

export function ComputeCard({ status, online }: { status: AgentStatus | null; online: boolean }) {
  if (!status) {
    return (
      <Card className="flex flex-col justify-between p-5">
        <div className="flex items-center gap-2 text-[13px] text-fog">
          <Cpu size={15} /> AI compute
        </div>
        <p className="mt-4 text-sm text-fog">
          {online ? "The agent's live status shows here while it runs." : "The agent is offline right now. Everything else on this page is read from the chains and stays live."}
        </p>
      </Card>
    );
  }
  const live = status.computeMode === "0g";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] text-fog">
          <Cpu size={15} /> AI compute
        </div>
        <Pill tone={live ? "neutral" : "quiet"}>{live ? "0G mainnet" : "Placeholder until 0G tokens"}</Pill>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <Stat label="Balance" value={usd(status.balanceUsd)} sub={`covers ${status.coversJobs} job${status.coversJobs === 1 ? "" : "s"}`} />
        <Stat label="Jobs waiting" value={status.waiting} sub={`${status.served} served since start`} accent={status.waiting > 0} />
      </div>
      <div className="mt-4 text-[12px] text-fog">
        About {usd(status.costPerJobUsd, 4)} of AI per job, learned from each bill.
      </div>
    </Card>
  );
}

/** Any agent's AI budget, read straight from its compute account in the 0G PaymentVault. */
export function VaultComputeCard({ compute }: { compute: Extract<Compute, { source: "0g-vault" }> | null }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] text-fog">
          <Cpu size={15} /> AI compute
        </div>
        <Pill tone="neutral">0G mainnet</Pill>
      </div>
      {compute ? (
        <>
          <div className="mt-5">
            <Stat label="Balance" value={usd(compute.balanceUsd)} sub={`${compute.balance0G.toFixed(4)} 0G in its compute account`} />
          </div>
          <p className="mt-4 text-[12px] text-fog">
            Read live from the 0G PaymentVault. Only agents that publish their status also show jobs waiting.
          </p>
          <div className="mt-auto pt-4 text-[12px]">
            <ExtLink href={compute.url}>account {short(compute.account)} on 0G</ExtLink>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-fog">Reading its compute account on 0G…</p>
      )}
    </Card>
  );
}

type Step = { title: string; where: string; value: string; detail: string; url?: string; done: boolean };

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
      title: "Customers pay per job",
      where: "x402 on Hedera",
      value: payment ? `${payments.length} payments` : "No payments yet",
      detail: payment ? `latest ${usd(payment.amountUsd)} ${ago(payment.at)}` : "each job is paid in USDC",
      url: payment?.url,
      done: Boolean(payment),
    },
    {
      title: "Runs short, borrows",
      where: "CreditLine on Hedera",
      value: loan ? `Borrowed ${usd(loan.amountUsd)}` : "No loans yet",
      detail: loan ? `owed ${usd(loan.owedAfterUsd)} after it · ${ago(loan.at)}` : "only when jobs outrun the budget",
      url: loan?.url,
      done: Boolean(loan),
    },
    {
      title: "Loan lands in 0G compute",
      where: "relay to 0G PaymentVault",
      value: deposit ? "Deposited" : lastLoan && !lastLoan.zgTx ? (zgLive ? "Depositing" : "Simulated") : "Waiting",
      detail: deposit ? `loan #${deposit.drawId} · ${ago(deposit.at)}` : zgLive ? "the relay deposits each loan on 0G" : "simulated until 0G deposits go live",
      url: deposit?.url,
      done: Boolean(deposit),
    },
    {
      title: "Jobs served with AI",
      where: !reportsJobs ? "the agent's own AI" : zgLive ? "0G inference" : "placeholder AI for now",
      value: status ? `${status.served} served` : reportsJobs ? "Agent offline" : "Not reported",
      detail: served ? served.detail : reportsJobs ? "every paid job is served or refunded" : "this agent doesn't publish its job count",
      done: Boolean(status?.served),
    },
    {
      title: "Income is split",
      where: "IncomeSplitter on Hedera",
      value: split ? `Split ${usd(split.amountUsd ?? (split.toLenderUsd ?? 0) + (split.toComputeUsd ?? 0) + (split.toOwnerUsd ?? 0))}` : "No splits yet",
      detail: split ? `lender ${usd(split.toLenderUsd)} · compute ${usd(split.toComputeUsd)} · owner ${usd(split.toOwnerUsd)}` : "lender, compute and owner shares",
      url: split?.url,
      done: Boolean(split),
    },
    {
      title: "Loan repays itself",
      where: "debt on the splitter",
      value: line.status === "defaulted" ? "Defaulted" : line.owedUsd === 0 ? "Repaid" : `${usd(line.owedUsd)} left`,
      detail:
        line.status === "defaulted"
          ? `${usd(line.owedUsd)} unpaid · the lender kept the ID`
          : line.owedUsd === 0 && released
            ? `ID returned to its owner ${ago(released.at)}`
            : "each split pays the lender first, then the ID is returned",
      url: line.owedUsd === 0 ? released?.url : undefined,
      done: line.status === "active" && line.owedUsd === 0,
    },
  ];

  return (
    <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-ink-line bg-ink-line sm:grid-cols-2 lg:grid-cols-6">
      {steps.map((step, i) => (
        <li key={step.title} className="flex flex-col bg-ink-2 p-4">
          <div className="flex items-center justify-between">
            <span className={`font-mono text-[11px] ${step.done ? "text-signal" : "text-fog"}`}>0{i + 1}</span>
            <span className="text-[11px] text-fog">{step.where}</span>
          </div>
          <div className="mt-3 text-[14px] font-semibold text-paper">{step.title}</div>
          <div className="tabular mt-3 font-mono text-[17px] font-semibold text-paper">{step.value}</div>
          <div className="mt-1 text-[12px] leading-snug text-fog">{step.detail}</div>
          {step.url && (
            <div className="mt-auto pt-3 text-[12px]">
              <ExtLink href={step.url}>transaction</ExtLink>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

"use client";

import { CircleCheck, CircleX, FingerprintPattern } from "lucide-react";
import type { BureauRecord, Customer, Line } from "@/lib/api";
import { atomic, pct, short, usd } from "@/lib/format";
import { LogPanel, type LogFilter } from "./LogPanel";
import { ExtLink, Label, Pill, SectionTitle, Skeleton } from "./ui";

const KINDS: Record<string, string> = {
  application: "Enrolled",
  underwriting: "Credit approved",
  refusal: "Credit refused",
  decision: "Limit set",
  loan: "Loan",
  disbursed: "Paid into 0G",
  repayment: "Repayment",
  repaid: "Repaid in full",
  default: "Default",
};

const NEGATIVE = new Set(["default", "refusal"]);
const POSITIVE = new Set(["underwriting", "repaid", "repayment"]);

const FILTERS: LogFilter<BureauRecord>[] = [
  { id: "all", label: "All", match: () => true },
  { id: "decisions", label: "Credit decisions", match: (r) => ["application", "underwriting", "refusal", "decision"].includes(r.kind) },
  { id: "loans", label: "Loans", match: (r) => r.kind === "loan" },
  { id: "compute", label: "Into 0G", match: (r) => r.kind === "disbursed" },
  { id: "repayments", label: "Repayments", match: (r) => r.kind === "repayment" || r.kind === "repaid" },
  { id: "defaults", label: "Defaults", match: (r) => r.kind === "default" },
];

const GRID = "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[150px_84px_minmax(0,1fr)_auto]";

/** The agent's public credit history on Arkiv, newest first. */
export function Bureau({ records, owner, loading }: { records: BureauRecord[] | null; owner?: string; loading: boolean }) {
  return (
    <LogPanel
      items={records}
      loading={loading}
      filters={FILTERS}
      grid={GRID}
      rowKey={(r) => r.key}
      empty="No records here yet."
      order="decisions first, then each loan in order"
      intro={
        <>
          Written to Arkiv by the bureau wallet {owner ? <span className="font-mono">{short(owner)}</span> : null}. Each record deletes itself when it expires, like an old entry on a credit report.
        </>
      }
      columns={
        <>
          <span>Record</span>
          <span>Amount</span>
          <span>Detail</span>
          <span className="text-right">Expires</span>
        </>
      }
      row={(r) => {
        const amount = r.kind === "refusal" || r.simulated ? undefined : r.amountUsd ?? r.owedUsd ?? r.limitUsd;
        const tone = NEGATIVE.has(r.kind) ? "text-accent" : POSITIVE.has(r.kind) ? "text-ok" : r.simulated ? "text-violet" : "text-fg";
        return (
          <div className={`grid items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5 transition-colors hover:bg-surface-2 ${GRID}`}>
            <span className={tone}>{r.simulated ? "into 0G · simulated" : (KINDS[r.kind] ?? r.kind).toLowerCase()}</span>
            <span className="tabular text-right text-fg sm:text-left">{r.simulated ? `${r.amount0G?.toFixed(3)} 0G` : amount !== undefined ? usd(amount) : ""}</span>
            <span className="min-w-0 truncate text-muted">{r.reason ?? (r.drawId !== undefined ? `loan #${r.drawId}` : "")}</span>
            <span className="flex items-center justify-end gap-3 text-faint">
              {Math.round(r.expiresInDays)}d left
              {r.hederaTx && <ExtLink href={r.hederaTx}>tx</ExtLink>}
            </span>
          </div>
        );
      }}
    />
  );
}

const VERDICTS: Record<string, { label: string; tone: "quiet" | "outline" }> = {
  independent: { label: "Independent", tone: "quiet" },
  "owner-funded": { label: "Funded by the owner", tone: "outline" },
  "round-trip": { label: "Agent's own money", tone: "outline" },
  "self-payment": { label: "Paid itself", tone: "outline" },
};

function Trail({ customer, owner }: { customer: Customer; owner: string }) {
  if (customer.path.length > 1) {
    return (
      <span className="font-mono text-[12px] text-muted">
        {customer.path.map((account, i) => (
          <span key={account}>
            {i > 0 && <span className="px-1 text-accent">←</span>}
            <span className={account === owner ? "text-accent" : ""}>{account === owner ? `${account} (owner)` : account}</span>
          </span>
        ))}
      </span>
    );
  }
  return <span className="font-mono text-[12px] text-muted">funded by {customer.fundedBy.join(", ") || "nobody found"} (outside money)</span>;
}

/** The underwriting decision behind a line: every fact it used, its memo, and the hash check against Hedera. */
export function Underwriting({ records, line }: { records: BureauRecord[] | null; line: Line | null }) {
  const decisions = (records ?? []).filter((r) => r.decision?.facts);
  const current = decisions.find((r) => line && r.decisionHash === line.decisionHash) ?? decisions[0];
  if (!records) {
    return (
      <div className="p-5">
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (!current?.decision) {
    return (
      <p className="px-5 py-8 text-[14px] text-muted">
        {line?.stage === "enrolled"
          ? "No credit check yet. Once customers have paid the agent's income contract, its owner can ask for one."
          : "This line's limit was set by hand for a test, so there is no underwriting decision to show."}
      </p>
    );
  }
  const { facts, memo, memoAuthor } = current.decision;
  const onChain = line ? current.decisionHash === line.decisionHash : false;
  return (
    <div>
      <SectionTitle
        title={facts.approved ? "Approved" : "Refused"}
        hint="Before lending, the underwriter traces where each customer's money came from, up to three hops back. Money that leads to the agent or its owner counts for nothing."
        right={
          facts.approved ? (
            <Pill tone="ok">
              <CircleCheck size={13} /> Limit {usd(atomic(facts.limit))}
            </Pill>
          ) : (
            <Pill tone="outline">
              <CircleX size={13} /> Refused
            </Pill>
          )
        }
      />
      <div className="mt-5 grid grid-cols-2 gap-4 px-5 sm:grid-cols-4">
        {[
          ["Income received", usd(atomic(facts.received))],
          ["Verified as real", usd(atomic(facts.verifiedIncome))],
          ["Independent customers", `${facts.independentCustomers} of ${facts.customers.length}`],
          ["Margin per job", facts.pricePerJob ? pct(facts.margin) : "–"],
        ].map(([label, value]) => (
          <div key={label}>
            <Label>{label}</Label>
            <div className="tabular mt-2 font-mono text-[20px] font-semibold text-fg">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 overflow-x-auto border-y border-line">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
            <tr>
              <th className="px-5 py-2 font-normal">Customer</th>
              <th className="px-3 py-2 font-normal">Paid</th>
              <th className="px-3 py-2 font-normal">Verdict</th>
              <th className="px-5 py-2 font-normal">Where the money came from</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {facts.customers.map((c) => (
              <tr key={c.account}>
                <td className="px-5 py-2.5 font-mono text-fg">{c.account}</td>
                <td className="tabular px-3 py-2.5 font-mono text-fg">
                  {usd(atomic(c.paid))} <span className="text-muted">/ {c.jobs} job{c.jobs === 1 ? "" : "s"}</span>
                </td>
                <td className="px-3 py-2.5">
                  <Pill tone={VERDICTS[c.verdict]?.tone ?? "quiet"}>{VERDICTS[c.verdict]?.label ?? c.verdict}</Pill>
                </td>
                <td className="px-5 py-2.5">
                  <Trail customer={c} owner={facts.owner} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="text-[12px] text-muted">Memo ({memoAuthor === "template" ? "written from the rules" : memoAuthor})</div>
          <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-fg">{memo}</p>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-line p-3 text-[12px] text-muted lg:max-w-[260px]">
          <FingerprintPattern size={16} className="mt-0.5 shrink-0 text-fg" />
          <div>
            <div className="text-fg">{current.hashMatches ? "Record matches its fingerprint" : "Record does NOT match its fingerprint"}</div>
            <div className="mt-1">
              {facts.approved
                ? onChain
                  ? "The same fingerprint is stored with the limit on Hedera, so this is the reasoning behind the current limit."
                  : "A newer decision has replaced this one on Hedera."
                : "Refused, so no limit was set on Hedera."}
            </div>
            <div className="mt-1 font-mono">{current.decisionHash ? short(current.decisionHash, 10, 6) : ""}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

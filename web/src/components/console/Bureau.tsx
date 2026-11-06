import { CircleCheck, CircleX, FingerprintPattern } from "lucide-react";
import type { BureauRecord, Customer, Line } from "@/lib/api";
import { atomic, pct, short, usd } from "@/lib/format";
import { Card, ExtLink, Pill, SectionTitle, Skeleton } from "./ui";

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

export function Bureau({ records, owner, loading }: { records: BureauRecord[] | null; owner?: string; loading: boolean }) {
  return (
    <Card>
      <SectionTitle
        title="Credit bureau"
        hint={
          <>
            Public credit history on Arkiv, written by the bureau wallet {owner ? short(owner) : ""}. Each record deletes itself when it
            expires, like an old entry on a credit report.
          </>
        }
      />
      <ul className="mt-4 divide-y divide-ink-line">
        {loading && !records && Array.from({ length: 4 }, (_, i) => <li key={i} className="px-5 py-3"><Skeleton className="h-6" /></li>)}
        {records && records.length === 0 && <li className="px-5 py-6 text-sm text-fog">No records for this agent yet.</li>}
        {records?.map((r) => {
          const amount = r.kind === "refusal" || r.simulated ? undefined : r.amountUsd ?? r.owedUsd ?? r.limitUsd;
          return (
            <li key={r.key} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
              <span className={`w-28 shrink-0 ${r.kind === "default" || r.kind === "refusal" ? "text-signal" : "text-paper"}`}>{r.simulated ? "Into 0G, simulated" : KINDS[r.kind] ?? r.kind}</span>
              <span className="tabular w-16 shrink-0 font-mono text-paper">
                {r.simulated ? `${r.amount0G?.toFixed(3)} 0G` : amount !== undefined ? usd(amount) : ""}
              </span>
              <span className="min-w-0 flex-1 truncate text-fog">{r.reason ?? (r.drawId !== undefined ? `loan #${r.drawId}` : "")}</span>
              <span className="shrink-0 text-fog">expires in {Math.round(r.expiresInDays)}d</span>
              {r.hederaTx && <ExtLink href={r.hederaTx} className="shrink-0">tx</ExtLink>}
            </li>
          );
        })}
      </ul>
    </Card>
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
      <span className="font-mono text-[12px] text-fog">
        {customer.path.map((account, i) => (
          <span key={account}>
            {i > 0 && <span className="px-1 text-signal">←</span>}
            <span className={account === owner ? "text-signal" : ""}>{account === owner ? `${account} (owner)` : account}</span>
          </span>
        ))}
      </span>
    );
  }
  return <span className="font-mono text-[12px] text-fog">funded by {customer.fundedBy.join(", ") || "nobody found"} (outside money)</span>;
}

/** The underwriting decision behind a line: every fact it used, its memo, and the hash check against Hedera. */
export function Underwriting({ records, line }: { records: BureauRecord[] | null; line: Line | null }) {
  const decisions = (records ?? []).filter((r) => r.decision?.facts);
  const current = decisions.find((r) => line && r.decisionHash === line.decisionHash) ?? decisions[0];
  if (!records) {
    return (
      <Card className="p-5">
        <Skeleton className="h-40" />
      </Card>
    );
  }
  if (!current?.decision) {
    return (
      <Card>
        <SectionTitle
          title="Underwriting"
          hint={
            line?.stage === "enrolled"
              ? "No credit check yet. Once customers have paid the agent's income contract, its owner can ask for one."
              : "This line's limit was set by hand for a test, so there is no underwriting decision to show."
          }
        />
        <div className="h-5" />
      </Card>
    );
  }
  const { facts, memo, memoAuthor } = current.decision;
  const onChain = line ? current.decisionHash === line.decisionHash : false;
  return (
    <Card>
      <SectionTitle
        title="Underwriting"
        hint="Before lending, the underwriter traces where each customer's money came from, up to three hops back. Money that leads to the agent or its owner counts for nothing."
        right={
          facts.approved ? (
            <Pill tone="signal">
              <CircleCheck size={13} /> Approved {usd(atomic(facts.limit))}
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
            <div className="text-[12px] text-fog">{label}</div>
            <div className="tabular mt-1 font-mono text-[19px] font-semibold text-paper">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 overflow-x-auto border-y border-ink-line">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="text-[12px] text-fog">
            <tr>
              <th className="px-5 py-2 font-normal">Customer</th>
              <th className="px-3 py-2 font-normal">Paid</th>
              <th className="px-3 py-2 font-normal">Verdict</th>
              <th className="px-5 py-2 font-normal">Where the money came from</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-line">
            {facts.customers.map((c) => (
              <tr key={c.account}>
                <td className="px-5 py-2.5 font-mono text-paper">{c.account}</td>
                <td className="tabular px-3 py-2.5 font-mono text-paper">
                  {usd(atomic(c.paid))} <span className="text-fog">/ {c.jobs} job{c.jobs === 1 ? "" : "s"}</span>
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
          <div className="text-[12px] text-fog">Memo ({memoAuthor === "template" ? "written from the rules" : memoAuthor})</div>
          <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-paper">{memo}</p>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-ink-line p-3 text-[12px] text-fog lg:max-w-[260px]">
          <FingerprintPattern size={16} className="mt-0.5 shrink-0 text-paper" />
          <div>
            <div className="text-paper">{current.hashMatches ? "Record matches its fingerprint" : "Record does NOT match its fingerprint"}</div>
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
    </Card>
  );
}

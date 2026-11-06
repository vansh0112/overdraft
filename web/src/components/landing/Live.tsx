"use client";

import { usePoll, type AgentSummary, type Line } from "@/lib/api";
import { DEPLOYMENTS } from "@/lib/deployments";
import { CountUp } from "@/components/system/CountUp";

/** The hero's status chip: how many agents have a credit decision right now, or just "live" while the API is away. */
export function LiveBadge() {
  const agents = usePoll<AgentSummary[]>("/api/agents", 60_000).data;
  return (
    <span className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surface/70 py-1 pl-2.5 pr-3 font-mono text-[11.5px] text-muted backdrop-blur">
      <span className="status-dot text-ok" aria-hidden="true" />
      {agents ? `${agents.length} agents underwritten` : "live"} · Hedera testnet
    </span>
  );
}

const money = (n: number) => `$${n.toFixed(2)}`;
const whole = (n: number) => String(Math.round(n));

/** Live numbers from the network. Hidden entirely while the API can't be reached, so it never shows zeros. */
export function NetworkStats() {
  const agents = usePoll<AgentSummary[]>("/api/agents", 30_000).data;
  const demo = usePoll<Line>(`/api/agents/${DEPLOYMENTS.demoAgentId}`, 30_000).data;
  if (!agents || !demo) return null;
  const approved = agents.filter((a) => a.stage === "approved");
  const stats = [
    { value: agents.length, format: whole, label: "agents underwritten" },
    { value: approved.reduce((sum, a) => sum + (a.limitUsd ?? 0), 0), format: money, label: "credit open now" },
    { value: demo.loans.length, format: whole, label: "loans by the demo agent" },
    { value: agents.filter((a) => a.stage === "refused" || a.stage === "defaulted").length, format: whole, label: "refused or defaulted, on record" },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-3xl border border-line lg:grid-cols-4">
      {stats.map((s, i) => (
        <div key={s.label} className={`flex flex-col bg-surface p-5 sm:p-7 ${i % 2 ? "border-l border-line" : ""} ${i > 1 ? "border-t border-line lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
          <dt className="order-2 mt-2 text-[12.5px] leading-snug text-muted sm:text-[13.5px]">{s.label}</dt>
          <dd className="font-mono text-[28px] font-semibold leading-none tracking-[-0.02em] sm:text-[40px]">
            <CountUp value={s.value} format={s.format} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

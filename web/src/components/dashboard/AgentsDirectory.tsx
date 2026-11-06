"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { usePoll, type AgentSummary, type Stage } from "@/lib/api";
import { agentLabel } from "@/lib/agents";
import { short, usd } from "@/lib/format";
import { CollateralPill, StagePill } from "../console/panels";
import { Card, Label, LiveDot, PageHead, Skeleton } from "../console/ui";
import { Lookup } from "./Lookup";

type Filter = "all" | "approved" | "enrolled" | "refused" | "defaulted";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "approved", label: "Active" },
  { id: "enrolled", label: "Enrolled" },
  { id: "refused", label: "Refused" },
  { id: "defaulted", label: "Defaulted" },
];

function stageOf(a: AgentSummary): Stage {
  return a.stage ?? (a.status === "active" ? "approved" : a.status);
}

/** Every agent with a credit line or a credit decision, filterable and searchable. Anyone can check any agent. */
export function AgentsDirectory() {
  const agents = usePoll<AgentSummary[]>("/api/agents", 15000);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, approved: 0, enrolled: 0, refused: 0, defaulted: 0 };
    for (const a of agents.data ?? []) {
      c.all += 1;
      const s = stageOf(a);
      if (s in c) c[s as Filter] += 1;
    }
    return c;
  }, [agents.data]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    return (agents.data ?? []).filter((a) => {
      if (filter !== "all" && stageOf(a) !== filter) return false;
      if (!q) return true;
      const owner = (a.status === "refused" ? a.ownerAddress : a.owner) ?? "";
      return `${a.agentId} ${agentLabel(a.agentId, a.name)} ${owner}`.toLowerCase().includes(q);
    });
  }, [agents.data, filter, query]);

  const open = (agents.data ?? []).filter((a) => stageOf(a) === "approved");
  const totals = [
    { label: "Credit open", value: usd(open.reduce((s, a) => s + (a.limitUsd ?? 0), 0)) },
    { label: "Owed now", value: usd(open.reduce((s, a) => s + (a.owedUsd ?? 0), 0)), accent: true },
    { label: "IDs locked", value: String((agents.data ?? []).filter((a) => a.collateral?.heldBy === "creditLine").length) },
  ];

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10">
      <PageHead
        status={
          <>
            <LiveDot on={Boolean(agents.data) && !agents.error} />
            {agents.data ? "live from Hedera and Arkiv" : agents.error ? "can't reach the console API right now" : "loading…"}
          </>
        }
        title="All agents"
        sub={<span className="max-w-2xl">Every agent with a credit line or a credit decision, read from the CreditLine on Hedera and the bureau on Arkiv.</span>}
        right={
          agents.data && (
            <dl className="flex gap-6 sm:gap-8">
              {totals.map((t) => (
                <div key={t.label}>
                  <dt>
                    <Label>{t.label}</Label>
                  </dt>
                  <dd className={`tabular mt-1.5 font-mono text-[20px] font-semibold ${t.accent ? "text-accent" : ""}`}>{t.value}</dd>
                </div>
              ))}
            </dl>
          )
        }
      />

      <div className="enter enter-1 mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 [scrollbar-width:none]" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition ${filter === f.id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg"}`}
            >
              {f.label}
              <span className="font-mono text-[10.5px] text-faint">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13.5px] text-faint transition focus-within:border-line-2 sm:w-64">
          <Search size={14} aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, name, owner" aria-label="Search agents" className="w-full bg-transparent text-fg outline-none placeholder:text-faint" />
        </label>
      </div>

      <Card className="enter enter-2 mt-4 overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,2.4fr)_24px] gap-4 border-b border-line px-5 py-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint lg:grid">
          <span>Agent</span>
          <span>Owner</span>
          <span>Owed / limit</span>
          <span>Status</span>
          <span />
        </div>
        <ul className="divide-y divide-line">
          {!agents.data &&
            Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="px-5 py-4">
                <Skeleton className="h-10" />
              </li>
            ))}
          {agents.data && shown.length === 0 && <li className="px-5 py-10 text-center text-[14px] text-muted">No agents match.</li>}
          {shown.map((a) => {
            const owner = a.status === "refused" ? a.ownerAddress : a.owner;
            const used = a.limitUsd ? Math.min(1, (a.owedUsd ?? 0) / a.limitUsd) : 0;
            return (
              <li key={a.agentId} className="group relative grid grid-cols-2 items-center gap-x-4 gap-y-3 px-5 py-4 text-[14px] transition-colors hover:bg-surface-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,2.4fr)_24px]">
                <Link href={`/agents/${a.agentId}`} className="col-span-2 flex min-w-0 items-center gap-3 after:absolute after:inset-0 lg:col-span-1">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-canvas-2 font-mono text-[11px] text-muted">{a.agentId}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-fg">Agent #{a.agentId}</span>
                    <span className="block truncate text-[12.5px] text-muted">{agentLabel(a.agentId, a.name)}</span>
                  </span>
                </Link>
                <div className="relative z-10 min-w-0 text-[13px]">
                  <span className="text-[11px] text-faint lg:hidden">Owner </span>
                  {owner ? (
                    <Link href={`/owners/${owner}`} className="font-mono text-muted transition hover:text-fg">
                      {short(owner)}
                    </Link>
                  ) : (
                    <span className="text-muted">–</span>
                  )}
                </div>
                <div className="min-w-0">
                  {a.status === "refused" ? (
                    <span className="font-mono text-faint">–</span>
                  ) : (
                    <>
                      <div className="tabular font-mono text-[13px]">
                        <span className={a.owedUsd ? "text-accent" : "text-fg"}>{usd(a.owedUsd)}</span>
                        <span className="text-faint"> / {usd(a.limitUsd)}</span>
                      </div>
                      <div className="mt-1.5 h-1 w-full max-w-[140px] overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${used * 100}%` }} />
                      </div>
                    </>
                  )}
                </div>
                <div className="col-span-2 flex flex-wrap gap-2 lg:col-span-1">
                  <StagePill stage={stageOf(a)} />
                  {a.collateral && <CollateralPill heldBy={a.collateral.heldBy} />}
                </div>
                <ArrowRight size={16} className="hidden text-faint transition group-hover:translate-x-0.5 group-hover:text-fg lg:block" aria-hidden="true" />
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mt-4 p-6">
        <Lookup />
      </Card>
    </div>
  );
}

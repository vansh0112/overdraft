"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { usePoll, type AgentSummary } from "@/lib/api";
import { agentLabel } from "@/lib/agents";
import { short, usd } from "@/lib/format";
import { CollateralPill, StagePill } from "../console/panels";
import { Card, LiveDot, Skeleton } from "../console/ui";
import { Lookup } from "./Lookup";

/** Every agent with a credit line or a credit decision. Anyone can check any agent. */
export function AgentsDirectory() {
  const agents = usePoll<AgentSummary[]>("/api/agents", 15000);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
      <div className="flex items-center gap-2 text-[13px] text-fog">
        <LiveDot on={Boolean(agents.data) && !agents.error} />
        {agents.data ? "Live from Hedera and Arkiv" : agents.error ? "Can't reach the console API right now" : "Loading…"}
      </div>
      <h1 className="mt-2 font-serif text-[44px] leading-none text-paper sm:text-[52px]">All agents</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fog">
        Every agent with a credit line or a credit decision, read from the CreditLine on Hedera and the bureau on Arkiv.
      </p>

      <Card className="mt-8 overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,2.4fr)_auto] gap-4 border-b border-ink-line px-5 py-3 text-[12px] text-fog lg:grid">
          <span>Agent</span>
          <span>Owner</span>
          <span>Limit</span>
          <span>Owed</span>
          <span>Status</span>
          <span className="w-12" />
        </div>
        <ul className="divide-y divide-ink-line">
          {!agents.data &&
            Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="px-5 py-4">
                <Skeleton className="h-10" />
              </li>
            ))}
          {agents.data?.map((a) => {
            const owner = a.status === "refused" ? a.ownerAddress : a.owner;
            return (
              <li
                key={a.agentId}
                className="grid grid-cols-2 items-center gap-x-4 gap-y-3 px-5 py-4 text-[14px] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,2.4fr)_auto]"
              >
                <Link href={`/agents/${a.agentId}`} className="col-span-2 min-w-0 lg:col-span-1">
                  <div className="font-semibold text-paper">Agent #{a.agentId}</div>
                  <div className="text-[12.5px] text-fog">{agentLabel(a.agentId, a.name)}</div>
                </Link>
                <div className="min-w-0 text-[13px]">
                  <span className="text-[11px] text-fog lg:hidden">Owner </span>
                  {owner ? (
                    <Link href={`/owners/${owner}`} className="font-mono text-fog transition hover:text-paper">
                      {short(owner)}
                    </Link>
                  ) : (
                    <span className="text-fog">–</span>
                  )}
                </div>
                <div className="tabular font-mono text-paper">
                  <span className="font-sans text-[11px] text-fog lg:hidden">Limit </span>
                  {a.status === "refused" ? "–" : usd(a.limitUsd)}
                </div>
                <div className={`tabular font-mono ${a.owedUsd ? "text-signal" : "text-paper"}`}>
                  <span className="font-sans text-[11px] text-fog lg:hidden">Owed </span>
                  {a.status === "refused" ? "–" : usd(a.owedUsd)}
                </div>
                <div className="col-span-2 flex flex-wrap gap-2 lg:col-span-1">
                  <StagePill stage={a.stage ?? (a.status === "active" ? "approved" : a.status)} />
                  {a.collateral && <CollateralPill heldBy={a.collateral.heldBy} />}
                </div>
                <Link
                  href={`/agents/${a.agentId}`}
                  aria-label={`Open agent #${a.agentId}`}
                  className="hidden w-12 justify-end text-fog transition hover:text-paper lg:flex"
                >
                  <ArrowRight size={16} />
                </Link>
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

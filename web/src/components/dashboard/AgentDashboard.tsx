"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CircleX } from "lucide-react";
import { API, usePoll, type ActivityEvent, type AgentSummary, type BureauRecord, type Compute, type Contracts, type Line } from "@/lib/api";
import { agentLabel } from "@/lib/agents";
import { short, usd } from "@/lib/format";
import { sameAddress, useWallet } from "@/lib/wallet";
import { Activity } from "../console/Activity";
import { Bureau, Underwriting } from "../console/Bureau";
import { DemoControls } from "../console/DemoControls";
import { ComputeCard, CreditLineCard, Loop, VaultComputeCard } from "../console/panels";
import { Card, Crumbs, ExtLink, LiveDot, Pill, Skeleton } from "../console/ui";
import { OwnerActions } from "../enrol/OwnerActions";

/** The owner's EVM address: lines carry it directly, refusals carry it next to the owner's Hedera account. */
function ownerAddress(summary: AgentSummary | undefined): string | undefined {
  return summary?.status === "refused" ? summary.ownerAddress : summary?.owner;
}

/** One agent: its credit line, AI compute, every loan step, its activity and its credit history. */
export function AgentDashboard({ agentId }: { agentId: number }) {
  const contracts = usePoll<Contracts>("/api/contracts", 60000);
  const agents = usePoll<AgentSummary[]>("/api/agents", 15000);
  const wallet = useWallet();
  useEffect(() => {
    const previous = document.title;
    document.title = `Agent #${agentId} · Overdraft`;
    return () => {
      document.title = previous;
    };
  }, [agentId]);

  const ready = Boolean(contracts.data && agents.data);
  const summary = agents.data?.find((a) => a.agentId === agentId);
  const refused = summary?.status === "refused";
  const hasLine = ready && Boolean(summary) && !refused;
  const missing = ready && !summary;
  const demo = contracts.data?.demoAgentId === agentId;

  const line = usePoll<Line>(hasLine ? `/api/agents/${agentId}` : null, demo ? 4000 : 8000);
  const compute = usePoll<Compute>(hasLine ? `/api/agents/${agentId}/compute` : null, demo ? 4000 : 20000);
  const activity = usePoll<ActivityEvent[]>(hasLine ? `/api/agents/${agentId}/activity` : null, demo ? 5000 : 10000);
  const bureau = usePoll<BureauRecord[]>(ready && summary ? `/api/agents/${agentId}/bureau` : null, 20000);

  const owner = line.data?.owner ?? ownerAddress(summary);
  const isOwner = sameAddress(wallet.address, owner);
  const siblings = (agents.data ?? []).filter((a) => a.agentId !== agentId && sameAddress(ownerAddress(a), owner));
  const status = compute.data?.source === "agent" ? compute.data.status : null;
  const terms = contracts.data?.terms;
  const unreachable = (agents.error || contracts.error) && !ready;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
      <Crumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          ...(owner ? [{ label: isOwner ? "Your agents" : `Owner ${short(owner)}`, href: `/owners/${owner}` }] : [{ label: "All agents", href: "/agents" }]),
          { label: `Agent #${agentId}` },
        ]}
      />

      {unreachable && (
        <div className="mb-6 rounded-xl border border-signal/60 px-4 py-3 text-[13px] text-paper">
          Can&apos;t reach the console API at <span className="font-mono">{API}</span>. Start it with{" "}
          <span className="font-mono">uvicorn overdraft.console:app --port 8000</span>.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] text-fog">
            <LiveDot on={ready && !agents.error} />
            {ready ? (contracts.data?.computeMode === "0g" ? "Live from Hedera, 0G and Arkiv" : "Live from Hedera and Arkiv · 0G in simulation") : "Connecting…"}
          </div>
          <h1 className="mt-2 font-serif text-[44px] leading-none text-paper sm:text-[52px]">
            Agent <span className="italic">#{agentId}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-fog">
            <span>
              {agentLabel(agentId, line.data?.name ?? summary?.name)}
              {line.data ? ` · agent account ${short(line.data.agent)}` : ""}
            </span>
            {isOwner && <Pill tone="neutral">You own this agent</Pill>}
            {demo && <Pill tone="quiet">Live demo</Pill>}
          </div>
        </div>
        {siblings.length > 0 && (
          <nav aria-label="More agents from this owner" className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-fog">Same owner</span>
            {siblings.map((a) => (
              <Link
                key={a.agentId}
                href={`/agents/${a.agentId}`}
                className="rounded-xl border border-ink-line px-3 py-2 text-left text-[12px] text-fog transition hover:border-fog hover:text-paper"
              >
                <div className="font-semibold text-paper">#{a.agentId}</div>
                <div className={a.stage === "approved" || a.stage === "enrolled" ? "" : "text-signal"}>{a.stage ?? a.status}</div>
              </Link>
            ))}
          </nav>
        )}
      </div>

      {missing && (
        <Card className="mt-8 p-6">
          <h2 className="font-serif text-[26px] leading-none text-paper">No credit line or decision for agent #{agentId}</h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-fog">
            This agent hasn&apos;t applied for credit with us, so there&apos;s nothing to show yet. Its owner can see their agents on the dashboard.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-[14px]">
            <Link href="/agents" className="text-paper underline underline-offset-4">
              All agents
            </Link>
            <Link href="/dashboard" className="text-paper underline underline-offset-4">
              Owner dashboard
            </Link>
          </div>
        </Card>
      )}

      {refused && summary && (
        <div className="mt-8 grid grid-cols-1 gap-4">
          <Card className="flex items-start gap-3 p-5">
            <CircleX className="mt-0.5 shrink-0 text-signal" size={20} />
            <div>
              <div className="text-[15px] font-semibold text-paper">No credit line: the underwriter refused this agent</div>
              <p className="mt-1 text-[14px] text-fog">Reason: {summary.reason}. The decision and every fact behind it are on Arkiv, below.</p>
            </div>
          </Card>
          <Underwriting records={bureau.data} line={null} />
          <Bureau records={bureau.data} owner={contracts.data?.bureau.owner} loading={!bureau.data} />
        </div>
      )}

      {isOwner && line.data?.application && line.data.stage !== "defaulted" && (
        <div className="mt-8">
          <OwnerActions line={line.data} />
        </div>
      )}

      {(hasLine || !ready) && (
        <div className={`${isOwner && line.data?.application ? "mt-4" : "mt-8"} grid grid-cols-1 gap-4`}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {line.data ? (
              <CreditLineCard line={line.data} termSeconds={terms?.termSeconds} />
            ) : (
              <Card className="p-5">
                <Skeleton className="h-44" />
              </Card>
            )}
            {demo && compute.data ? (
              <ComputeCard status={status} online={Boolean(status)} />
            ) : hasLine && !demo ? (
              <VaultComputeCard compute={compute.data?.source === "0g-vault" ? compute.data : null} />
            ) : (
              <Card className="p-5">
                <Skeleton className="h-44" />
              </Card>
            )}
          </div>
          {line.data && activity.data && <Loop events={activity.data} line={line.data} status={status} computeMode={contracts.data?.computeMode} reportsJobs={demo} />}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Activity events={activity.data} loading={!activity.data} />
            <Bureau records={bureau.data} owner={contracts.data?.bureau.owner} loading={!bureau.data} />
          </div>
          <Underwriting records={bureau.data} line={line.data} />
        </div>
      )}

      {demo && (
        <div className="mt-4">
          <DemoControls />
        </div>
      )}

      {contracts.data && line.data && terms && (
        <Card className="mt-4 p-5">
          <div className="text-[12px] text-fog">On-chain</div>
          <div className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-paper">CreditLine</div>
              <ExtLink href={contracts.data.creditLine.url} className="font-mono">
                {contracts.data.creditLine.id}
              </ExtLink>
            </div>
            <div>
              <div className="text-paper">This agent&apos;s splitter</div>
              <ExtLink href={line.data.splitter.url} className="font-mono">
                {line.data.splitter.id}
              </ExtLink>
            </div>
            <div>
              <div className="text-paper">Agent IDs (ERC-8004)</div>
              <span className="font-mono text-fog">{short(contracts.data.identityRegistry, 8, 6)}</span>
            </div>
            <div>
              <div className="text-paper">Terms</div>
              <span className="text-fog">
                {terms.feeBps / 100}% fee · {Math.round(terms.termSeconds / 86400)}-day term · {Math.round(terms.graceSeconds / 3600)}h grace
              </span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone="quiet">Paid in USDC {contracts.data.usdc}</Pill>
            <Pill tone="quiet">Bureau {short(contracts.data.bureau.owner)} on Arkiv</Pill>
            <Pill tone="quiet">
              Limit {usd(line.data.limitUsd)} for #{line.data.agentId}
            </Pill>
          </div>
        </Card>
      )}
    </div>
  );
}

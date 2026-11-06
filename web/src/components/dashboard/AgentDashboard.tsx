"use client";

import { useCallback, useEffect } from "react";
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
import { Tabs, type Tab } from "../console/Tabs";
import { Card, Crumbs, ExtLink, Label, LiveDot, PageHead, Pill, Skeleton } from "../console/ui";
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

  const { reload: reloadLine } = line;
  const { reload: reloadBureau } = bureau;
  const { reload: reloadActivity } = activity;
  const { reload: reloadAgents } = agents;
  const refresh = useCallback(() => {
    reloadLine();
    reloadBureau();
    reloadActivity();
    reloadAgents();
  }, [reloadLine, reloadBureau, reloadActivity, reloadAgents]);

  const owner = line.data?.owner ?? ownerAddress(summary);
  const isOwner = sameAddress(wallet.address, owner);
  const siblings = (agents.data ?? []).filter((a) => a.agentId !== agentId && sameAddress(ownerAddress(a), owner));
  const status = compute.data?.source === "agent" ? compute.data.status : null;
  const terms = contracts.data?.terms;
  const unreachable = (agents.error || contracts.error) && !ready;

  const contractsTab = contracts.data && line.data && terms && (
    <div className="grid gap-5 p-5 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <Label>CreditLine</Label>
        <ExtLink href={contracts.data.creditLine.url} className="mt-2 font-mono">
          {contracts.data.creditLine.id}
        </ExtLink>
      </div>
      <div>
        <Label>This agent&apos;s splitter</Label>
        <ExtLink href={line.data.splitter.url} className="mt-2 font-mono">
          {line.data.splitter.id}
        </ExtLink>
      </div>
      <div>
        <Label>Agent IDs · ERC-8004</Label>
        <div className="mt-2 font-mono text-muted">{short(contracts.data.identityRegistry, 8, 6)}</div>
      </div>
      <div>
        <Label>Terms</Label>
        <div className="mt-2 text-muted">
          {terms.feeBps / 100}% fee · {Math.round(terms.termSeconds / 86400)}-day term · {Math.round(terms.graceSeconds / 3600)}h grace
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
        <Pill tone="quiet">Paid in USDC {contracts.data.usdc}</Pill>
        <Pill tone="quiet">Bureau {short(contracts.data.bureau.owner)} on Arkiv</Pill>
        <Pill tone="quiet">
          Limit {usd(line.data.limitUsd)} for #{line.data.agentId}
        </Pill>
      </div>
    </div>
  );

  const bureauTab: Tab = {
    id: "bureau",
    label: "Credit history",
    count: bureau.data?.length,
    content: <Bureau records={bureau.data} owner={contracts.data?.bureau.owner} loading={!bureau.data} />,
  };
  const underwritingTab: Tab = { id: "underwriting", label: "Underwriting", content: <Underwriting records={bureau.data} line={line.data} /> };

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10">
      <Crumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          ...(owner ? [{ label: isOwner ? "Your agents" : `Owner ${short(owner)}`, href: `/owners/${owner}` }] : [{ label: "All agents", href: "/agents" }]),
          { label: `Agent #${agentId}` },
        ]}
      />

      {unreachable && (
        <div className="mb-6 rounded-xl border border-accent/50 bg-accent/5 px-4 py-3 text-[13px] text-fg">
          Can&apos;t reach the console API at <span className="font-mono">{API}</span>. Start it with{" "}
          <span className="font-mono">uvicorn overdraft.console:app --port 8000</span>.
        </div>
      )}

      <PageHead
        status={
          <>
            <LiveDot on={ready && !agents.error} />
            {ready ? (contracts.data?.computeMode === "0g" ? "live from Hedera, 0G and Arkiv" : "live from Hedera and Arkiv · 0G simulated") : "connecting…"}
          </>
        }
        title={
          <>
            Agent <span className="text-faint">#</span>
            {agentId}
          </>
        }
        sub={
          <>
            <span>
              {agentLabel(agentId, line.data?.name ?? summary?.name)}
              {line.data ? (
                <>
                  {" · "}
                  <span className="font-mono text-[13px]">{short(line.data.agent)}</span>
                </>
              ) : null}
            </span>
            {isOwner && <Pill tone="neutral">You own this agent</Pill>}
            {demo && (
              <Pill tone="signal">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> Live demo
              </Pill>
            )}
          </>
        }
        right={
          siblings.length > 0 && (
            <nav aria-label="More agents from this owner" className="flex flex-wrap items-center gap-2">
              <Label className="mr-1">Same owner</Label>
              {siblings.map((a) => (
                <Link
                  key={a.agentId}
                  href={`/agents/${a.agentId}`}
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-left text-[12px] text-muted transition hover:-translate-y-0.5 hover:border-line-2 hover:text-fg"
                >
                  <div className="font-mono font-semibold text-fg">#{a.agentId}</div>
                  <div className={a.stage === "approved" ? "text-ok" : a.stage === "enrolled" ? "" : "text-accent"}>{a.stage ?? a.status}</div>
                </Link>
              ))}
            </nav>
          )
        }
      />

      {missing && (
        <Card className="mt-8 p-6">
          <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-fg">No credit line or decision for agent #{agentId}</h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
            This agent hasn&apos;t applied for credit with us, so there&apos;s nothing to show yet. Its owner can see their agents on the dashboard.
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-[14px]">
            <Link href="/agents" className="text-fg underline underline-offset-4">
              All agents
            </Link>
            <Link href="/dashboard" className="text-fg underline underline-offset-4">
              Owner dashboard
            </Link>
          </div>
        </Card>
      )}

      {refused && summary && (
        <div className="mt-8 grid grid-cols-1 gap-4">
          <Card className="flex items-start gap-3 border-accent/40 bg-accent/5 p-5">
            <CircleX className="mt-0.5 shrink-0 text-accent" size={20} />
            <div>
              <div className="text-[15px] font-semibold text-fg">No credit line: the underwriter refused this agent</div>
              <p className="mt-1 text-[14px] text-muted">Reason: {summary.reason}. The decision and every fact behind it are on Arkiv, below.</p>
            </div>
          </Card>
          <Tabs tabs={[underwritingTab, bureauTab]} />
        </div>
      )}

      {isOwner && line.data?.application && line.data.stage !== "defaulted" && (
        <div className="mt-8">
          <OwnerActions line={line.data} onFinished={refresh} />
        </div>
      )}

      {(hasLine || !ready) && (
        <div className={`${isOwner && line.data?.application ? "mt-4" : "mt-8"} grid grid-cols-1 gap-4`}>
          <div className="enter enter-1 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {line.data ? (
              <CreditLineCard line={line.data} events={activity.data} />
            ) : (
              <Card className="p-5">
                <Skeleton className="h-56" />
              </Card>
            )}
            {demo && compute.data ? (
              <ComputeCard status={status} online={Boolean(status)} />
            ) : hasLine && !demo ? (
              <VaultComputeCard compute={compute.data?.source === "0g-vault" ? compute.data : null} />
            ) : (
              <Card className="p-5">
                <Skeleton className="h-56" />
              </Card>
            )}
          </div>
          {line.data && activity.data ? (
            <div className="enter enter-2">
              <Loop events={activity.data} line={line.data} status={status} computeMode={contracts.data?.computeMode} reportsJobs={demo} />
            </div>
          ) : (
            <Card className="p-5">
              <Skeleton className="h-36" />
            </Card>
          )}
          <div className="enter enter-3">
            <Tabs
              tabs={[
                { id: "activity", label: "Activity", count: activity.data?.length, content: <Activity events={activity.data} loading={!activity.data} /> },
                bureauTab,
                underwritingTab,
                ...(contractsTab ? [{ id: "contracts", label: "Contracts", content: contractsTab }] : []),
              ]}
            />
          </div>
        </div>
      )}

      {demo && (
        <div className="mt-4">
          <DemoControls />
        </div>
      )}
    </div>
  );
}

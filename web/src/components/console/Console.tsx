"use client";

import { useEffect, useState } from "react";
import { CircleX } from "lucide-react";
import { API, usePoll, type ActivityEvent, type AgentSummary, type BureauRecord, type Line, type Overview } from "@/lib/api";
import { agentLabel } from "@/lib/agents";
import { short, usd } from "@/lib/format";
import { Activity } from "./Activity";
import { Bureau, Underwriting } from "./Bureau";
import { DemoControls } from "./DemoControls";
import { ComputeCard, CreditLineCard, Loop } from "./panels";
import { Card, ExtLink, LiveDot, Pill, Skeleton } from "./ui";

function readHashAgent(): number | null {
  const match = /agent-(\d+)/.exec(window.location.hash);
  return match ? Number(match[1]) : null;
}

export function Console() {
  const overview = usePoll<Overview>("/api/overview", 4000);
  const agents = usePoll<AgentSummary[]>("/api/agents", 15000);
  const main = overview.data?.line.agentId ?? null;
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    setPicked(readHashAgent());
    const onHash = () => setPicked(readHashAgent());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const selected = picked ?? main;
  const summary = agents.data?.find((a) => a.agentId === selected);
  const refused = summary?.status === "refused";
  const isMain = selected !== null && selected === main;

  const other = usePoll<Line>(selected !== null && !isMain && !refused && summary ? `/api/agents/${selected}` : null, 6000);
  const activity = usePoll<ActivityEvent[]>(selected !== null && !refused && summary ? `/api/agents/${selected}/activity` : null, 6000);
  const bureau = usePoll<BureauRecord[]>(selected !== null ? `/api/agents/${selected}/bureau` : null, 20000);

  const line = isMain ? overview.data?.line ?? null : other.data;
  const status = isMain ? overview.data?.agent ?? null : null;
  const contracts = overview.data?.contracts;
  const unreachable = overview.error && !overview.data;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
      {unreachable && (
        <div className="mb-6 rounded-xl border border-signal/60 px-4 py-3 text-[13px] text-paper">
          Can&apos;t reach the console API at <span className="font-mono">{API}</span>. Start it with{" "}
          <span className="font-mono">uvicorn overdraft.console:app --port 8000</span>.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] text-fog">
            <LiveDot on={Boolean(overview.data) && !overview.error} />
            {overview.data
              ? overview.data.agent?.computeMode === "0g"
                ? "Live from Hedera, 0G and Arkiv"
                : "Live from Hedera and Arkiv · 0G in simulation"
              : "Connecting…"}
          </div>
          <h1 className="mt-2 font-serif text-[44px] leading-none text-paper sm:text-[52px]">
            {selected !== null ? (
              <>
                Agent <span className="italic">#{selected}</span>
              </>
            ) : (
              "Console"
            )}
          </h1>
          {selected !== null && <p className="mt-2 text-[14px] text-fog">{agentLabel(selected)}{line ? ` · agent account ${short(line.agent)}` : ""}</p>}
        </div>
        <nav aria-label="Agents" className="flex flex-wrap gap-2">
          {(agents.data ?? []).map((a) => (
            <a
              key={a.agentId}
              href={`#agent-${a.agentId}`}
              onClick={() => setPicked(a.agentId)}
              className={`rounded-xl border px-3 py-2 text-left text-[12px] transition ${
                a.agentId === selected ? "border-paper bg-paper text-ink" : "border-ink-line text-fog hover:border-fog hover:text-paper"
              }`}
            >
              <div className="font-semibold">#{a.agentId}</div>
              <div className={a.status === "active" ? "" : a.agentId === selected ? "text-ink" : "text-signal"}>{a.status}</div>
            </a>
          ))}
        </nav>
      </div>

      {refused && summary ? (
        <div className="mt-8 grid grid-cols-1 gap-4">
          <Card className="flex items-start gap-3 p-5">
            <CircleX className="mt-0.5 shrink-0 text-signal" size={20} />
            <div>
              <div className="text-[15px] font-semibold text-paper">No credit line: the underwriter refused this agent</div>
              <p className="mt-1 text-[14px] text-fog">Reason: {summary.reason}. The decision and every fact behind it are on Arkiv, below.</p>
            </div>
          </Card>
          <Underwriting records={bureau.data} line={null} />
          <Bureau records={bureau.data} owner={contracts?.bureau.owner} loading={!bureau.data} />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {line ? <CreditLineCard line={line} termSeconds={contracts?.terms.termSeconds} /> : <Card className="p-5"><Skeleton className="h-44" /></Card>}
            {isMain ? <ComputeCard status={status} online={Boolean(status)} /> : (
              <Card className="p-5 text-[14px] text-fog">
                This is a test line. The live agent and its AI compute are on{" "}
                <a href={`#agent-${main}`} onClick={() => setPicked(main)} className="text-paper underline underline-offset-4">agent #{main}</a>.
              </Card>
            )}
          </div>
          {line && activity.data && <Loop events={activity.data} line={line} status={status} />}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Activity events={activity.data} loading={!activity.data} />
            <Bureau records={bureau.data} owner={contracts?.bureau.owner} loading={!bureau.data} />
          </div>
          <Underwriting records={bureau.data} line={line} />
        </div>
      )}

      <div className="mt-4">
        <DemoControls />
      </div>

      {contracts && (
        <Card className="mt-4 p-5">
          <div className="text-[12px] text-fog">On-chain</div>
          <div className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-paper">CreditLine</div>
              <ExtLink href={contracts.creditLine.url} className="font-mono">{contracts.creditLine.id}</ExtLink>
            </div>
            <div>
              <div className="text-paper">Agent #{main}&apos;s splitter</div>
              <ExtLink href={contracts.splitter.url} className="font-mono">{contracts.splitter.id}</ExtLink>
            </div>
            <div>
              <div className="text-paper">Agent IDs (ERC-8004)</div>
              <span className="font-mono text-fog">{short(contracts.identityRegistry, 8, 6)}</span>
            </div>
            <div>
              <div className="text-paper">Terms</div>
              <span className="text-fog">
                {contracts.terms.feeBps / 100}% fee · {Math.round(contracts.terms.termSeconds / 86400)}-day term · {Math.round(contracts.terms.graceSeconds / 3600)}h grace
              </span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone="quiet">Paid in USDC {contracts.usdc}</Pill>
            <Pill tone="quiet">Bureau {short(contracts.bureau.owner)} on Arkiv</Pill>
            {line && <Pill tone="quiet">Limit {usd(line.limitUsd)} for #{line.agentId}</Pill>}
          </div>
        </Card>
      )}
    </div>
  );
}

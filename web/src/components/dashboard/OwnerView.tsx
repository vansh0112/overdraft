"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight, CircleX, IdCard, LogOut } from "lucide-react";
import { ApiError, usePoll, type Line, type OwnerView as Owner } from "@/lib/api";
import { agentLabel } from "@/lib/agents";
import { date, short, usd } from "@/lib/format";
import { disconnectWallet, sameAddress, useWallet } from "@/lib/wallet";
import { CollateralPill, UsageBar } from "../console/panels";
import { Card, Crumbs, ExtLink, LiveDot, Pill, SectionTitle, Skeleton, Stat } from "../console/ui";

function plural(count: number, noun: string): string {
  return `across ${count} ${noun}${count === 1 ? "" : "s"}`;
}

function LineCard({ line }: { line: Line }) {
  const defaulted = line.status === "defaulted";
  return (
    <Link href={`/agents/${line.agentId}`} className="group flex flex-col rounded-2xl border border-ink-line bg-ink-2 p-5 transition hover:border-fog">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-serif text-[28px] leading-none text-paper">
            Agent <span className="italic">#{line.agentId}</span>
          </div>
          <div className="mt-1.5 text-[13px] text-fog">{agentLabel(line.agentId)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {defaulted ? <Pill tone="outline">Defaulted</Pill> : <Pill tone="quiet">Active</Pill>}
          <CollateralPill heldBy={line.collateral.heldBy} />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4">
        <Stat label="Limit" value={usd(line.limitUsd)} />
        <Stat label={defaulted ? "Unpaid" : "Owed"} value={usd(line.owedUsd)} accent={line.owedUsd > 0} />
        <Stat label="Available" value={usd(line.availableUsd)} />
      </div>
      <div className="mt-5">
        <UsageBar line={line} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-fog">
        <span>
          {defaulted
            ? "Closed after a default"
            : line.owedUsd > 0 && line.dueAt
              ? `Due ${date(line.dueAt)} · repaid from income`
              : "Nothing owed"}
          {` · ${line.loans.length} loan${line.loans.length === 1 ? "" : "s"}`}
        </span>
        <span className="inline-flex items-center gap-1 text-paper group-hover:underline">
          Open <ArrowRight size={13} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

function Empty({ owner }: { owner: Owner }) {
  return (
    <Card className="mt-8 p-6">
      <h2 className="font-serif text-[26px] leading-none text-paper">No agents here yet</h2>
      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-fog">
        This wallet hasn&apos;t registered an agent ID, and has no credit line or credit decision with us. An agent needs an ERC-8004 ID, its
        on-chain identity, before it can apply for credit.
      </p>
      {!owner.account && (
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-fog">
          This address isn&apos;t on Hedera testnet yet. Sending it free test HBAR from the{" "}
          <a href="https://portal.hedera.com/faucet" target="_blank" rel="noreferrer" className="text-paper underline underline-offset-4">
            Hedera faucet
          </a>{" "}
          creates its account.
        </p>
      )}
      <Link href="/docs" className="mt-5 inline-flex items-center gap-1.5 text-[14px] text-paper underline-offset-4 hover:underline">
        How credit works <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </Card>
  );
}

/** One owner's agents: credit lines, refused applications and IDs not enrolled yet, all read from public chains. */
export function OwnerView({ owner }: { owner: string }) {
  const view = usePoll<Owner>(`/api/owners/${encodeURIComponent(owner)}`, 10000);
  const wallet = useWallet();
  const data = view.data;
  const isYou = Boolean(data && sameAddress(wallet.address, data.address));
  const failed = view.error && !data;
  const title = isYou ? "Your agents" : `Owner ${short(data?.address ?? owner)}`;
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Overdraft`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
      <Crumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: title }]} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] text-fog">
            <LiveDot on={Boolean(data) && !view.error} />
            {data ? "Live from Hedera and Arkiv" : failed ? "Not available" : "Loading…"}
          </div>
          <h1 className="mt-2 font-serif text-[44px] leading-none text-paper sm:text-[52px]">
            {isYou ? (
              "Your agents"
            ) : (
              <>
                Owner <span className="italic">{short(data?.address ?? owner)}</span>
              </>
            )}
          </h1>
          {data && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-fog">
              {data.account && data.accountUrl ? <ExtLink href={data.accountUrl}>Hedera account {data.account}</ExtLink> : <span>Not on Hedera testnet yet</span>}
              <span className="break-all font-mono text-[12px]">{data.address}</span>
              {isYou && <Pill tone="neutral">This is your wallet</Pill>}
            </div>
          )}
        </div>
        {isYou && (
          <button onClick={disconnectWallet} className="inline-flex items-center gap-2 rounded-xl border border-ink-line px-3 py-2 text-[13px] text-fog transition hover:border-fog hover:text-paper">
            <LogOut size={14} aria-hidden="true" /> Disconnect
          </button>
        )}
      </div>

      {failed && (
        <Card className="mt-8 p-5 text-[14px] text-fog">
          {view.error instanceof ApiError ? view.error.message : "Can't reach the console API right now."}
        </Card>
      )}

      {!data && !failed && (
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5 lg:col-span-2">
            <Skeleton className="h-16" />
          </Card>
          <Card className="p-5">
            <Skeleton className="h-40" />
          </Card>
          <Card className="p-5">
            <Skeleton className="h-40" />
          </Card>
        </div>
      )}

      {data && data.agents.length + data.refused.length + data.unenrolled.length === 0 && <Empty owner={data} />}

      {data && data.agents.length > 0 && (
        <>
          <Card className="mt-8 grid grid-cols-2 gap-6 p-5 lg:grid-cols-4">
            <Stat label="Credit limit" value={usd(data.totals.limitUsd)} sub={plural(data.agents.filter((a) => a.status === "active").length, "active line")} />
            <Stat label="Owed" value={usd(data.totals.owedUsd)} sub="repaid automatically from income" accent={data.totals.owedUsd > 0} />
            <Stat label="Available to borrow" value={usd(data.totals.availableUsd)} sub="right now, across lines" />
            <Stat
              label="IDs locked as collateral"
              value={data.totals.idsLocked}
              sub={data.totals.idsLost ? `${data.totals.idsLost} taken by the lender after a default` : "each returns when its line is repaid"}
            />
          </Card>

          <h2 className="mt-10 font-serif text-[30px] leading-none text-paper">Credit lines</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.agents.map((line) => (
              <LineCard key={line.agentId} line={line} />
            ))}
          </div>
        </>
      )}

      {data && data.refused.length > 0 && (
        <Card className="mt-8">
          <SectionTitle title="Refused applications" hint="The underwriter checked these agents' income and found too little of it from independent customers." />
          <ul className="mt-4 divide-y divide-ink-line border-t border-ink-line">
            {data.refused.map((r) => (
              <li key={r.agentId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="flex min-w-0 items-start gap-3">
                  <CircleX size={18} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-paper">
                      Agent #{r.agentId} · {agentLabel(r.agentId)}
                    </div>
                    <div className="mt-0.5 text-[13px] text-fog">{r.reason}</div>
                  </div>
                </div>
                <Link href={`/agents/${r.agentId}`} className="inline-flex items-center gap-1 text-[13px] text-paper underline-offset-4 hover:underline">
                  See the decision <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && data.unenrolled.length > 0 && (
        <Card className="mt-8">
          <SectionTitle title="Not enrolled" hint="Agent IDs this wallet registered that have no credit line and no credit decision yet." />
          <ul className="flex flex-wrap gap-2 p-5">
            {data.unenrolled.map((u) => (
              <li key={u.agentId} className="inline-flex items-center gap-2 rounded-xl border border-ink-line px-3 py-2 text-[13px] text-paper">
                <IdCard size={14} className="text-fog" aria-hidden="true" />
                Agent #{u.agentId}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

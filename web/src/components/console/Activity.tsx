"use client";

import { useState } from "react";
import { Ban, CircleCheck, Coins, HandCoins, Lock, ShieldExclamationPoint, Split, SquarePen, Zap } from "lucide-react";
import type { ActivityEvent, ActivityKind } from "@/lib/api";
import { ago, usd } from "@/lib/format";
import { Card, ExtLink, SectionTitle, Skeleton } from "./ui";

const icons: Record<ActivityKind, React.ReactNode> = {
  payment: <Coins size={15} />,
  loan: <HandCoins size={15} />,
  deposit: <Zap size={15} />,
  split: <Split size={15} />,
  released: <CircleCheck size={15} />,
  locked: <Lock size={15} />,
  limit: <SquarePen size={15} />,
  breach: <ShieldExclamationPoint size={15} />,
  default: <Ban size={15} />,
};

const highlighted: ActivityKind[] = ["loan", "deposit", "breach", "default"];

function detail(e: ActivityEvent): string | null {
  switch (e.kind) {
    case "payment":
      return e.payer ? `from ${e.payer}` : null;
    case "loan":
      return `owed ${usd(e.owedAfterUsd)} after this loan`;
    case "split":
      return `lender ${usd(e.toLenderUsd)} · compute ${usd(e.toComputeUsd)} · owner ${usd(e.toOwnerUsd)} · owed ${usd(e.owedAfterUsd)} after`;
    default:
      return null;
  }
}

export function Activity({ events, loading }: { events: ActivityEvent[] | null; loading: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const shown = events ? (showAll ? events : events.slice(0, 12)) : [];
  return (
    <Card>
      <SectionTitle title="Activity" hint="Every payment, loan, deposit and split on this line, newest first. Each one links to its transaction." />
      <ul className="mt-4 divide-y divide-ink-line">
        {loading && !events && Array.from({ length: 5 }, (_, i) => <li key={i} className="px-5 py-3"><Skeleton className="h-9" /></li>)}
        {events && events.length === 0 && <li className="px-5 py-6 text-sm text-fog">Nothing has happened on this line yet.</li>}
        {shown.map((e) => (
          <li key={`${e.kind}-${e.at}-${e.url}`} className="flex items-start gap-3 px-5 py-3">
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${highlighted.includes(e.kind) ? "bg-signal text-ink" : "bg-ink-3 text-paper"}`}>
              {icons[e.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] text-paper">{e.title}</div>
              {detail(e) && <div className="mt-0.5 truncate text-[12px] text-fog">{detail(e)}</div>}
            </div>
            <div className="shrink-0 text-right text-[12px]">
              <div className="text-fog">{ago(e.at)}</div>
              <ExtLink href={e.url} className="mt-0.5">{e.kind === "deposit" ? (e.simulated ? "PaymentVault" : "0G tx") : "tx"}</ExtLink>
            </div>
          </li>
        ))}
      </ul>
      {events && events.length > 12 && (
        <button onClick={() => setShowAll(!showAll)} className="w-full border-t border-ink-line px-5 py-3 text-left text-[13px] text-fog transition hover:text-paper">
          {showAll ? "Show fewer" : `Show all ${events.length}`}
        </button>
      )}
    </Card>
  );
}

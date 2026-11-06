"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { ActivityEvent } from "@/lib/api";
import { ago, usd } from "@/lib/format";
import { EVENT_TAG, TONE_TEXT, eventAmount, eventLine } from "@/lib/events";
import { LogPanel, type LogFilter } from "./LogPanel";

function key(e: ActivityEvent) {
  return `${e.kind}-${e.at}-${e.url}`;
}

const FILTERS: LogFilter<ActivityEvent>[] = [
  { id: "all", label: "All", match: () => true },
  { id: "payments", label: "Payments", match: (e) => e.kind === "payment" },
  { id: "loans", label: "Loans", match: (e) => e.kind === "loan" || e.kind === "locked" || e.kind === "limit" },
  { id: "compute", label: "Into 0G", match: (e) => e.kind === "deposit" },
  { id: "repayments", label: "Repayments", match: (e) => e.kind === "split" || e.kind === "released" },
  { id: "problems", label: "Breaches and defaults", match: (e) => e.kind === "breach" || e.kind === "default" },
];

const GRID = "grid-cols-[56px_minmax(0,1fr)_auto] sm:grid-cols-[72px_64px_minmax(0,1fr)_auto]";

/** Every payment, loan, deposit and split on the line as a live log, newest first. New entries glow as they arrive. */
export function Activity({ events, loading }: { events: ActivityEvent[] | null; loading: boolean }) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!events) return;
    const keys = new Set(events.map(key));
    if (seen.current === null) {
      seen.current = keys;
      return;
    }
    const added = new Set([...keys].filter((k) => !seen.current!.has(k)));
    seen.current = keys;
    if (added.size === 0) return;
    setFresh(added);
    const timer = window.setTimeout(() => setFresh(new Set()), 3000);
    return () => window.clearTimeout(timer);
  }, [events]);

  return (
    <LogPanel
      items={events}
      loading={loading}
      filters={FILTERS}
      grid={GRID}
      rowKey={key}
      empty="Nothing here yet."
      columns={
        <>
          <span>When</span>
          <span>Type</span>
          <span>What happened</span>
          <span className="text-right">Amount</span>
        </>
      }
      row={(e) => {
        const tag = EVENT_TAG[e.kind];
        const amount = eventAmount(e);
        return (
          <a
            href={e.url}
            target="_blank"
            rel="noreferrer"
            className={`group grid items-baseline gap-x-3 px-5 py-2.5 transition-colors hover:bg-surface-2 ${GRID} ${fresh.has(key(e)) ? "bg-accent/10" : ""}`}
          >
            <span className="text-faint">{ago(e.at)}</span>
            <span className={`hidden sm:inline ${TONE_TEXT[tag.tone]}`}>{tag.tag}</span>
            <span className="min-w-0">
              <span className={`mr-2 sm:hidden ${TONE_TEXT[tag.tone]}`}>{tag.tag}</span>
              <span className="text-fg/90">{eventLine(e)}</span>
              {e.kind === "split" && e.owedAfterUsd !== undefined && <span className="text-faint"> · owed {usd(e.owedAfterUsd)}</span>}
            </span>
            <span className="flex items-center justify-end gap-1.5">
              {amount && e.kind !== "split" && <span className={TONE_TEXT[amount.tone]}>{amount.text}</span>}
              <ArrowUpRight size={12} className="text-faint opacity-40 transition group-hover:opacity-100" aria-hidden="true" />
            </span>
          </a>
        );
      }}
    />
  );
}

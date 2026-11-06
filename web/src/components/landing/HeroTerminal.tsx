"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { usePoll, type ActivityEvent, type Line } from "@/lib/api";
import { DEPLOYMENTS } from "@/lib/deployments";
import { EVENT_TAG, TONE_TEXT, clock, eventAmount, eventLine } from "@/lib/events";

const AGENT = DEPLOYMENTS.demoAgentId;
const ROWS = 11;

// Shown only while the API can't be reached, and labelled as a replay: the shape of one real rush.
const REPLAY: ActivityEvent[] = (() => {
  const t0 = 1_793_963_320;
  const url = `https://hashscan.io/testnet/contract/${DEPLOYMENTS.hedera.creditLine.id}`;
  const pay = (dt: number, payer: string): ActivityEvent => ({ at: t0 + dt, kind: "payment", title: "", url, amountUsd: 0.02, payer, x402: true });
  return [
    pay(0, "0.0.11329612"),
    pay(1, "0.0.11324428"),
    { at: t0 + 8, kind: "loan", title: "", url, amountUsd: 0.06, owedAfterUsd: 0.09 },
    { at: t0 + 9, kind: "split", title: "", url, toLenderUsd: 0.012, toComputeUsd: 0.008, toOwnerUsd: 0.02, owedAfterUsd: 0.078 },
    pay(11, "0.0.11329613"),
    pay(11, "0.0.11329615"),
    pay(12, "0.0.11329612"),
    { at: t0 + 20, kind: "deposit", title: "", url, simulated: true, amount0G: 0.382 },
    pay(16, "0.0.11329614"),
    { at: t0 + 24, kind: "split", title: "", url, toLenderUsd: 0.036, toComputeUsd: 0.024, toOwnerUsd: 0.06, owedAfterUsd: 0.042 },
    { at: t0 + 40, kind: "split", title: "", url, toLenderUsd: 0.042, toComputeUsd: 0.024, toOwnerUsd: 0.054, owedAfterUsd: 0 },
  ];
})();

function key(e: ActivityEvent) {
  return `${e.at}-${e.kind}-${e.drawId ?? ""}-${e.payer ?? ""}`;
}

/** The hero's live window: the demo agent's latest on-chain events typing in, oldest first, with its credit in the status bar. */
export function HeroTerminal() {
  const activity = usePoll<ActivityEvent[]>(`/api/agents/${AGENT}/activity`, 15_000);
  const line = usePoll<Line>(`/api/agents/${AGENT}`, 15_000).data;
  const replay = !activity.data && activity.error !== null;
  const events = useMemo(() => {
    const source = activity.data ?? (replay ? REPLAY : []);
    return [...source].sort((a, b) => b.at - a.at).slice(0, ROWS).reverse();
  }, [activity.data, replay]);

  // Lines type in one by one the first time; after that, new events slide in and glow briefly.
  const [typed, setTyped] = useState(0);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (events.length === 0 || typed >= events.length) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setTyped(reduced ? events.length : typed + 1), typed === 0 ? 500 : 230);
    return () => window.clearTimeout(timer);
  }, [events.length, typed]);

  useEffect(() => {
    if (events.length === 0) return;
    const keys = new Set(events.map(key));
    if (seen.current === null) {
      seen.current = keys;
      return;
    }
    const added = new Set([...keys].filter((k) => !seen.current!.has(k)));
    seen.current = keys;
    if (added.size === 0) return;
    setFresh(added);
    const timer = window.setTimeout(() => setFresh(new Set()), 2400);
    return () => window.clearTimeout(timer);
  }, [events]);

  const shown = events.slice(0, typed);
  const used = line && line.limitUsd > 0 ? Math.min(1, line.owedUsd / line.limitUsd) : 0;

  return (
    <div className="relative">
      <div className="glow absolute -inset-16 -z-10 opacity-80" aria-hidden="true" />
      <div className="overflow-hidden rounded-2xl border border-line-2 bg-surface/90 shadow-[var(--shadow)] backdrop-blur">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="flex gap-1.5" aria-hidden="true">
            <i className="h-2.5 w-2.5 rounded-full bg-line-2" />
            <i className="h-2.5 w-2.5 rounded-full bg-line-2" />
            <i className="h-2.5 w-2.5 rounded-full bg-line-2" />
          </span>
          <span className="ml-2 truncate font-mono text-[11.5px] text-muted">agent-{AGENT} · on-chain events</span>
          <span className={`ml-auto flex shrink-0 items-center gap-2 font-mono text-[11px] ${replay ? "text-faint" : "text-ok"}`}>
            <span className={replay ? "h-2 w-2 rounded-full bg-faint" : "status-dot"} aria-hidden="true" />
            {replay ? "replay" : "live"}
          </span>
        </div>

        <div className="relative h-[292px] overflow-hidden px-2 py-2 font-mono text-[11.5px] leading-[1.9] sm:h-[318px] sm:text-[12.3px]" aria-live="polite">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-surface to-transparent" aria-hidden="true" />
          <div className="absolute inset-x-2 bottom-2 flex flex-col">
            {events.length === 0 &&
              Array.from({ length: 7 }, (_, i) => <div key={i} className="skeleton my-[7px] h-[12px] rounded" style={{ width: `${55 + ((i * 17) % 40)}%` }} />)}
            {shown.map((e) => {
              const tag = EVENT_TAG[e.kind];
              const amount = eventAmount(e);
              const k = key(e);
              return (
                <a
                  key={k}
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`group grid grid-cols-[52px_50px_minmax(0,1fr)_auto] items-baseline gap-2 rounded-md px-2 transition-colors hover:bg-surface-2 sm:grid-cols-[64px_56px_minmax(0,1fr)_auto] ${fresh.has(k) ? "bg-accent/10" : ""}`}
                  style={{ animation: "rise .35s cubic-bezier(.2,.7,.2,1) both" }}
                >
                  <span className="text-faint">{clock(e.at).slice(0, 8)}</span>
                  <span className={TONE_TEXT[tag.tone]}>{tag.tag}</span>
                  <span className="truncate text-fg/90">{eventLine(e)}</span>
                  <span className={`hidden text-right sm:inline ${amount ? TONE_TEXT[amount.tone] : ""}`}>
                    {amount?.text}
                    <ArrowUpRight size={11} className="ml-1 inline opacity-0 transition group-hover:opacity-60" aria-hidden="true" />
                  </span>
                </a>
              );
            })}
            {events.length > 0 && (
              <div className="caret px-2 text-faint">
                <span className="text-accent">$</span> waiting for the next customer
              </div>
            )}
          </div>
        </div>

        <Link
          href={`/agents/${AGENT}`}
          className="group flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-canvas-2/60 px-4 py-3 font-mono text-[11.5px] text-muted transition hover:text-fg"
        >
          <span>
            limit <b className="font-medium text-fg">{line ? line.limitUsd.toFixed(3) : "…"}</b>
          </span>
          <span>
            owed <b className="font-medium text-accent">{line ? line.owedUsd.toFixed(3) : "…"}</b>
          </span>
          <span className="hidden sm:inline">
            available <b className="font-medium text-ok">{line ? line.availableUsd.toFixed(3) : "…"}</b>
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-line-2" aria-hidden="true">
              <span className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-1000" style={{ width: `${used * 100}%` }} />
            </span>
            <span className="transition group-hover:translate-x-0.5">open →</span>
          </span>
        </Link>
      </div>
    </div>
  );
}

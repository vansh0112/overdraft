"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getJson, type Overview } from "@/lib/api";
import { usd } from "@/lib/format";

/** Live numbers from the console API; hidden if it can't be reached, so the page never shows made-up figures. */
export function LiveStrip() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    getJson<Overview>("/api/overview").then(setData).catch(() => setData(null));
  }, []);

  if (!data) return null;
  const { line } = data;
  const items = [
    { label: "credit limit", value: usd(line.limitUsd) },
    { label: "owed right now", value: usd(line.owedUsd) },
    { label: "loans so far", value: String(line.loans.length) },
    { label: "agent ID", value: line.collateral.heldBy === "creditLine" ? "locked" : line.collateral.heldBy === "owner" ? "with owner" : "taken" },
  ];
  return (
    <Link href="/console" className="group mt-10 block rounded-2xl border border-paper-line bg-paper transition hover:border-ink">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-2 text-[13px] text-slate">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-signal" aria-hidden="true" />
          Live now · agent #{line.agentId}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4 sm:pl-6">
          {items.map((i) => (
            <div key={i.label}>
              <div className="tabular font-mono text-[18px] font-semibold text-ink">{i.value}</div>
              <div className="text-[12px] text-slate">{i.label}</div>
            </div>
          ))}
        </div>
        <span className="text-[13px] text-ink underline-offset-4 group-hover:underline">Open the console →</span>
      </div>
    </Link>
  );
}

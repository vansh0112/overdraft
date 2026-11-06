"use client";

import { useEffect, useRef, useState } from "react";

export const API = (process.env.NEXT_PUBLIC_CONSOLE_API ?? "http://localhost:8000").replace(/\/$/, "");

export type Contracts = {
  network: string;
  creditLine: { id: string; url: string };
  splitter: { id: string; url: string };
  identityRegistry: string;
  usdc: string;
  bureau: { network: string; owner: string; schema: string };
  terms: { feeBps: number; termSeconds: number; graceSeconds: number };
};

export type Line = {
  agentId: number;
  status: "active" | "defaulted";
  agent: string;
  owner: string;
  zgAccount: string;
  splitter: { id: string; url: string; balanceUsd: number };
  limitUsd: number;
  owedUsd: number;
  availableUsd: number;
  dueAt: number | null;
  decisionHash: string;
  collateral: { locked: boolean; heldBy: "creditLine" | "owner" | "treasury"; holder: string };
  loans: { id: number; amountUsd: number; zgTx: string | null }[];
};

export type AgentEvent = { at: number; kind: string; detail: string; url: string | null; requestId?: string; teeVerified?: boolean };

export type AgentStatus = {
  agentId: number;
  computeMode: "placeholder" | "0g";
  balanceUsd: number;
  reserveUsd: number;
  coversJobs: number;
  tier: string;
  waiting: number;
  served: number;
  refused: number;
  costPerJobUsd: number;
  owedUsd: number;
  availableUsd: number;
  events: AgentEvent[];
};

export type Overview = { contracts: Contracts; agent: AgentStatus | null; line: Line };

export type AgentSummary = {
  agentId: number;
  status: "active" | "defaulted" | "refused";
  limitUsd?: number;
  owedUsd?: number;
  availableUsd?: number;
  collateral?: Line["collateral"];
  reason?: string;
};

export type ActivityKind = "limit" | "locked" | "loan" | "deposit" | "released" | "breach" | "default" | "split" | "payment";

export type ActivityEvent = {
  at: number;
  kind: ActivityKind;
  title: string;
  url: string;
  amountUsd?: number;
  owedAfterUsd?: number;
  drawId?: number;
  dueAt?: number;
  toLenderUsd?: number;
  toComputeUsd?: number;
  toOwnerUsd?: number;
  payer?: string;
  x402?: boolean;
};

export type Customer = { account: string; paid: number; jobs: number; verdict: string; path: string[]; fundedBy: string[] };

export type Facts = {
  agentId: number;
  agentAccount: string;
  owner: string;
  incomeAccounts: string[];
  window: { days: number };
  rules: { traceHops: number; concentrationCap: number; minIndependentCustomers: number; minMargin: number; limitShare: number; maxNewAgentLimit: number };
  customers: Customer[];
  lenderTransfersIgnored: number;
  received: number;
  verifiedIncome: number;
  countedIncome: number;
  independentCustomers: number;
  pricePerJob: number;
  costPerJob: number;
  margin: number;
  approved: boolean;
  limit: number;
  reasons: string[];
};

export type BureauRecord = {
  key: string;
  kind: string;
  expiresInDays: number;
  amountUsd?: number;
  limitUsd?: number;
  owedAfterUsd?: number;
  owedUsd?: number;
  drawId?: number;
  dueAt?: number;
  reason?: string;
  zgTx?: string;
  hederaTx?: string;
  decision?: { facts: Facts; memo: string; memoAuthor: string };
  hashMatches?: boolean;
  decisionHash?: string;
};

export type DemoRun = { name: string | null; running: boolean; output: string[]; startedAt: number | null; exitCode: number | null };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { cache: "no-store", ...init });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = (await response.json()).detail ?? detail;
    } catch {}
    throw new ApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
}

/** Fetches `path` now and every `intervalMs` while the tab is visible. A null path pauses it. */
export function usePoll<T>(path: string | null, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const current = useRef(path);

  useEffect(() => {
    current.current = path;
    setData(null);
    setError(null);
    if (!path) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const value = await getJson<T>(path);
          if (!stopped && current.current === path) {
            setData(value);
            setError(null);
            setUpdatedAt(Date.now());
          }
        } catch (e) {
          if (!stopped) setError(e as Error);
        }
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [path, intervalMs]);

  return { data, error, updatedAt };
}

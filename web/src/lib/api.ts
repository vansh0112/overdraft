"use client";

import { useCallback, useEffect, useState } from "react";

export const API = (process.env.NEXT_PUBLIC_CONSOLE_API ?? "http://localhost:8000").replace(/\/$/, "");

/** The Overdraft sandbox: a paid x402 test endpoint for any agent, which pays its income contract once enrolled. */
export function sandboxEndpoint(agentId: number): string {
  return `${API}/sandbox/${agentId}/translate`;
}

export function isSandboxEndpoint(url: string | null | undefined): boolean {
  return Boolean(url && url.startsWith(`${API}/sandbox/`));
}

export type Contracts = {
  network: string;
  creditLine: { id: string; url: string };
  splitter: { id: string; url: string };
  identityRegistry: string;
  usdc: string;
  bureau: { network: string; owner: string; schema: string };
  terms: { feeBps: number; termSeconds: number; graceSeconds: number };
  demoAgentId: number;
  demoOwner: string;
  computeMode: "placeholder" | "0g";
};

export type Line = {
  agentId: number;
  /** From the agent's ERC-8004 registration file, when it's stored on-chain. */
  name: string | null;
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
  stage: Stage;
  /** Why the latest check refused it, when the stage is "refused". */
  reason: string | null;
  application: Application | null;
};

/** Where a line stands: enrolled lines have no credit until a check approves them. */
export type Stage = "approved" | "enrolled" | "refused" | "no-credit" | "defaulted";

/** What the owner enrolled the agent with (their signed application on Arkiv). */
export type Application = {
  endpoint: string;
  incomeAccount: string | null;
  aiCostPerJobUsd: number;
  priceUsd: number;
  enrolledAt: number;
  arkivKey: string;
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
  name?: string | null;
  status: "active" | "defaulted" | "refused";
  stage?: Stage;
  limitUsd?: number;
  owedUsd?: number;
  availableUsd?: number;
  collateral?: Line["collateral"];
  /** The owner's EVM address for agents with a line; the owner's Hedera account for refused ones. */
  owner?: string;
  agent?: string;
  reason?: string;
  ownerAddress?: string;
  agentAccount?: string;
};

export type Refusal = Required<Pick<AgentSummary, "agentId" | "reason" | "owner" | "ownerAddress" | "agentAccount">> & { status: "refused" };

/** An agent's AI budget: the demo agent reports its own status; any other agent's is read from its 0G compute account. */
export type Compute =
  | { source: "agent"; account: string; status: AgentStatus | null }
  | { source: "0g-vault"; account: string; balance0G: number; balanceUsd: number; url: string };

export type OwnerView = {
  address: string;
  account: string | null;
  accountUrl: string | null;
  agents: Line[];
  refused: Refusal[];
  unenrolled: { agentId: number }[];
  totals: { limitUsd: number; owedUsd: number; inDefaultUsd: number; availableUsd: number; idsLocked: number; idsLost: number };
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
  /** A loan's 0G deposit that was a dry run against the live PaymentVault: nothing was sent or spent. */
  simulated?: boolean;
  amount0G?: number;
  balanceBefore0G?: number;
  balanceAfter0G?: number;
  zgBlock?: number;
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
  application?: { endpoint: string; owner: string; splitterId: string; enrolledAt: number };
  simulated?: boolean;
  amount0G?: number;
  balanceBefore0G?: number;
  balanceAfter0G?: number;
  zgBlock?: number;
  hashMatches?: boolean;
  decisionHash?: string;
};

export type EnrolConfig = {
  domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
  types: Record<"Enrol" | "CreditCheck", { name: string; type: string }[]>;
  creditLine: `0x${string}`;
  identityRegistry: `0x${string}`;
  usdc: string;
  network: string;
  signatureTtlSeconds: number;
  maxAiCostPerJob: number;
  checkCooldownSeconds: number;
  allowLocalEndpoints: boolean;
  enrolSteps: string[];
  checkSteps: string[];
};

/** What an owner still needs before enrolling. */
export type Readiness = {
  owner: string;
  account: string | null;
  hbar: number;
  usdcReady: boolean;
  collateralApproved: boolean;
  agentId?: number;
  exists?: boolean;
  ownsId?: boolean;
  enrolled?: boolean;
  /** The agent wallet's Hedera account, when asked about one (null if it has none yet). */
  agentAccount?: string | null;
};

export type Job<R> = {
  kind: "enrol" | "check";
  agentId: number;
  state: "queued" | "running" | "done" | "failed";
  error: string | null;
  steps: { label: string; done: boolean }[];
  result: R;
  updatedAt: number;
};

export type EnrolResult = { splitterId: string; splitter: string; lineTx: string; fingerprint: string; arkivKey: string | null; warning?: string };

export type CheckResult = {
  approved: boolean;
  limitUsd: number;
  reasons: string[];
  independentCustomers: number;
  minIndependentCustomers: number;
  verifiedIncomeUsd: number;
  receivedUsd: number;
  decisionHash: string;
  arkivKey: string | null;
  limitTx: string | null;
};

export type EndpointStatus = { endpoint: string; payTo: string[]; splitterId: string; paysSplitter: boolean; error: string | null };

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

export function postJson<T>(path: string, body: object): Promise<T> {
  return getJson<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

/** Fetches `path` now and every `intervalMs` while the tab is visible. A null path pauses it; reload() fetches at once. */
export function usePoll<T>(path: string | null, intervalMs: number) {
  // Results are kept with the path they belong to, so switching paths never shows the previous path's data.
  const [result, setResult] = useState<{ path: string | null; data: T | null; error: Error | null; updatedAt: number | null }>({
    path: null,
    data: null,
    error: null,
    updatedAt: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const value = await getJson<T>(path);
          if (!stopped) setResult({ path, data: value, error: null, updatedAt: Date.now() });
        } catch (e) {
          if (!stopped) setResult((last) => (last.path === path ? { ...last, error: e as Error } : { path, data: null, error: e as Error, updatedAt: null }));
        }
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [path, intervalMs, nonce]);

  const current = path !== null && result.path === path ? result : null;
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data: current?.data ?? null, error: current?.error ?? null, updatedAt: current?.updatedAt ?? null, reload };
}

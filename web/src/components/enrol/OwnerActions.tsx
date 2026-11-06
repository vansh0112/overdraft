"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, CircleX, ShieldCheck } from "lucide-react";
import { ApiError, postJson, usePoll, type CheckResult, type EndpointStatus, type EnrolConfig, type Job, type Line } from "@/lib/api";
import { signRequest } from "@/lib/contracts";
import { usd } from "@/lib/format";
import { switchToHedera, useWallet, walletError } from "@/lib/wallet";
import { Card, ExtLink, Pill, SectionTitle, Skeleton } from "../console/ui";
import { CopyValue } from "./EnrolFlow";
import { JobProgress } from "./JobProgress";

const HEDERA_TESTNET = 296;

function Outcome({ result }: { result: CheckResult }) {
  if (result.approved) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-ink-line bg-ink p-4">
        <CircleCheck size={18} className="mt-0.5 shrink-0 text-signal" />
        <div className="text-[14px] text-paper">
          Approved: a limit of {usd(result.limitUsd)}, from {usd(result.verifiedIncomeUsd)} of income from {result.independentCustomers} independent
          customers. Your agent can borrow up to it whenever its AI budget runs short.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-ink-line bg-ink p-4">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-paper">
        <CircleX size={17} className="text-signal" /> Not yet
      </div>
      <ul className="mt-3 space-y-1.5 text-[13.5px] text-fog">
        <li>
          Independent customers: <span className="text-paper">{result.independentCustomers}</span> of the {result.minIndependentCustomers} needed
        </li>
        {result.reasons.map((reason) => (
          <li key={reason}>{reason[0].toUpperCase() + reason.slice(1)}</li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] text-fog">Customers who pay through your endpoint count once the underwriter can trace their money to someone other than you.</p>
    </div>
  );
}

/**
 * What only the owner can do on an enrolled agent: point income at its contract, then ask for a credit check.
 * `onFinished` runs when a check ends, so the page can show the new limit at once.
 */
export function OwnerActions({ line, onFinished }: { line: Line; onFinished?: () => void }) {
  const wallet = useWallet();
  const config = usePoll<EnrolConfig>("/api/enrol/config", 300_000);
  const endpoint = usePoll<EndpointStatus>(`/api/agents/${line.agentId}/endpoint`, 15_000);
  const job = usePoll<{ job: Job<CheckResult> | null }>(`/api/agents/${line.agentId}/check`, 3000);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const current = job.data?.job;
  const running = current?.state === "queued" || current?.state === "running";
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) onFinished?.();
    wasRunning.current = running;
  }, [running, onFinished]);
  const pays = endpoint.data?.paysSplitter === true;

  async function check() {
    if (!config.data) return;
    setBusy(true);
    setProblem(null);
    try {
      if (wallet.chainId !== HEDERA_TESTNET) await switchToHedera();
      const message = { agentId: line.agentId, issuedAt: Math.floor(Date.now() / 1000) };
      const signature = await signRequest(config.data, "CreditCheck", message);
      await postJson(`/api/agents/${line.agentId}/check`, { ...message, signature });
      job.reload();
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : walletError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle
        title="Your agent"
        hint="Only you see these, because your wallet owns this agent's ID. Signing a request is free and sends nothing."
        right={<Pill tone="neutral"><ShieldCheck size={13} /> Owner</Pill>}
      />
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <div className="rounded-xl border border-ink-line p-4">
          <div className="text-[13px] text-fog">Customers must pay its income contract</div>
          <div className="mt-2">
            <CopyValue value={line.splitter.id} />
          </div>
          <div className="mt-4 text-[13px] text-fog">Your endpoint</div>
          <div className="mt-1 break-all font-mono text-[13px] text-paper">{line.application?.endpoint}</div>
          {!endpoint.data ? (
            <Skeleton className="mt-3 h-5 w-64" />
          ) : endpoint.data.error ? (
            <p className="mt-3 text-[13px] text-signal">Can&apos;t check it right now: {endpoint.data.error}</p>
          ) : pays ? (
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-paper">
              <CircleCheck size={14} className="text-signal" /> Asks customers to pay the income contract
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-signal">
              It asks customers to pay {endpoint.data.payTo.join(", ")}. Set its x402 payTo to {line.splitter.id}, so income repays loans.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-ink-line p-4">
          <div className="text-[13px] text-fog">Credit</div>
          <div className="mt-1 text-[15px] font-semibold text-paper">
            {line.stage === "approved"
              ? `Limit ${usd(line.limitUsd)}`
              : line.stage === "refused"
                ? "Refused at the last check"
                : "No credit yet"}
          </div>
          {line.stage === "refused" && line.reason && <p className="mt-1 text-[13px] text-fog">{line.reason}</p>}
          <button
            onClick={check}
            disabled={busy || running || !pays || !config.data}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-[14px] font-semibold text-ink transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "Sign in your wallet…" : running ? "Checking…" : "Run a credit check"}
          </button>
          {!pays && endpoint.data && !endpoint.data.error && <p className="mt-2 text-[12.5px] text-fog">Point your endpoint at the income contract first.</p>}
          {problem && <p className="mt-2 text-[13px] text-signal">{problem}</p>}
          <p className="mt-2 text-[12.5px] text-fog">
            One check every {Math.round((config.data?.checkCooldownSeconds ?? 600) / 60)} minutes. The decision is published on Arkiv.
          </p>
        </div>
      </div>
      {current && (
        <div className="grid gap-4 border-t border-ink-line p-5 lg:grid-cols-2">
          <JobProgress job={current} />
          {current.state === "done" && (
            <div>
              <Outcome result={current.result} />
              {current.result.limitTx && (
                <div className="mt-2 text-[12.5px]">
                  <ExtLink href={current.result.limitTx}>limit set on Hedera</ExtLink>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

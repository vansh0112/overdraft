"use client";

import { useEffect, useState } from "react";
import { KeyRound, Play, Search } from "lucide-react";
import { ApiError, getJson, type DemoRun } from "@/lib/api";
import { Card, SectionTitle } from "./ui";

const STORAGE_KEY = "overdraft.demoPassword";

function readSaved(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Starts real demo actions on testnet. The API checks the password; it is kept only for this browser tab. */
export function DemoControls() {
  // Rendered only in the browser (after the page knows it's the demo agent), so the saved password can be read at once.
  const [password, setPassword] = useState(readSaved);
  const [message, setMessage] = useState<string | null>(null);
  const [run, setRun] = useState<DemoRun | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    getJson<{ demoControls: boolean }>("/api/health")
      .then((h) => setEnabled(h.demoControls))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const value = await getJson<DemoRun>("/api/demo/last");
        if (!stopped) setRun(value);
        if (!stopped) timer = setTimeout(tick, value.running ? 1500 : 6000);
      } catch {
        if (!stopped) timer = setTimeout(tick, 10000);
      }
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  async function start(path: string, body?: object) {
    setMessage(null);
    try {
      sessionStorage.setItem(STORAGE_KEY, password);
    } catch {}
    try {
      await getJson(path, {
        method: "POST",
        headers: { "content-type": "application/json", "x-demo-password": password },
        body: JSON.stringify(body ?? {}),
      });
      setRun(await getJson<DemoRun>("/api/demo/last"));
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Couldn't reach the console API");
    }
  }

  const busy = run?.running ?? false;
  if (enabled === false) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="text-[20px] font-semibold tracking-[-0.025em] leading-tight text-fg">Run the demo</div>
          <p className="mt-2 max-w-2xl text-[13px] text-muted">
            Demo actions send real testnet payments, so they run on the presenter&apos;s machine. Everything above updates here within seconds when they do.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <SectionTitle
        title="Run the demo"
        hint="These start real transactions on Hedera testnet. A rush sends paid jobs from five customer wallets at once, so the agent has to borrow."
      />
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
        <label className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] text-muted focus-within:border-muted">
          <KeyRound size={14} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Demo password"
            aria-label="Demo password"
            className="w-44 bg-transparent text-fg outline-none placeholder:text-muted"
          />
        </label>
        <button
          onClick={() => start("/api/demo/rush", { jobs: 8 })}
          disabled={busy || !password}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-[14px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-40"
        >
          <Play size={15} /> Send a rush of 8 paid jobs
        </button>
        <button
          onClick={() => start("/api/demo/check-fake-agent")}
          disabled={busy || !password}
          className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-[14px] font-semibold text-fg transition hover:border-muted disabled:opacity-40"
        >
          <Search size={15} /> Re-check the fake agent
        </button>
        {message && <span className="text-[13px] text-accent">{message}</span>}
      </div>
      <div className="p-5">
        <div className="mb-2 text-[12px] text-muted">
          {run?.name ? `${run.name}: ${run.running ? "running…" : run.exitCode === 0 ? "finished" : `stopped (exit ${run.exitCode})`}` : "Nothing run yet in this session."}
        </div>
        <pre className="max-h-72 overflow-auto rounded-xl border border-line bg-canvas p-4 font-mono text-[12px] leading-relaxed text-muted">
          {run?.output.length ? run.output.join("\n") : "Output appears here."}
        </pre>
      </div>
    </Card>
  );
}

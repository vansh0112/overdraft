"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { ArrowRight, Check, Copy, Plus, Wallet } from "lucide-react";
import { ApiError, postJson, usePoll, type EnrolConfig, type EnrolResult, type Job, type OwnerView, type Readiness } from "@/lib/api";
import { approveCollateral, registerAgent, registrationUri, signRequest } from "@/lib/contracts";
import { short } from "@/lib/format";
import { connectWallet, switchToHedera, useWallet, walletError } from "@/lib/wallet";
import { Card, Crumbs, ExtLink, Skeleton } from "../console/ui";
import { JobProgress } from "./JobProgress";

const HEDERA_TESTNET = 296;
const MIN_HBAR = 0.5; // enough for registering an ID and approving it, with room to spare
const FAUCET = "https://portal.hedera.com/faucet";

type StepState = "done" | "current" | "locked";
type Form = { agent: string; zgAccount: string; sameZg: boolean; endpoint: string; incomeFrom: "none" | "agent" | "owner"; cost: string };

const primary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-[14px] font-semibold text-ink transition hover:brightness-110 disabled:opacity-40";
const secondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-ink-line px-4 py-2.5 text-[14px] font-semibold text-paper transition hover:border-fog disabled:opacity-40";
const input =
  "w-full rounded-xl border border-ink-line bg-ink px-3 py-2.5 font-mono text-[14px] text-paper outline-none transition placeholder:text-fog focus:border-fog";

function Step({ n, title, state, summary, children }: { n: number; title: string; state: StepState; summary?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className={`p-5 transition ${state === "locked" ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-3.5">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[13px] ${
            state === "done" ? "bg-signal text-ink" : state === "current" ? "border border-paper text-paper" : "border border-ink-line text-fog"
          }`}
          aria-hidden="true"
        >
          {state === "done" ? <Check size={14} strokeWidth={3} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="pt-0.5 text-[16px] font-semibold text-paper">{title}</h2>
          {summary && <div className="mt-1 text-[13px] text-fog">{summary}</div>}
          {children && state !== "locked" && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </Card>
  );
}

export function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-ink-line px-2.5 py-1 font-mono text-[13px] text-paper transition hover:border-fog"
      aria-label={`Copy ${value}`}
    >
      {value} {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[12.5px] leading-relaxed text-fog">{children}</p>;
}

function Problem({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[13px] text-signal">{children}</p>;
}

/** Client-side checks; the API checks everything again. */
function validate(form: Form, config: EnrolConfig | null) {
  const errors: Partial<Record<keyof Form, string>> = {};
  if (form.agent && !isAddress(form.agent, { strict: false })) errors.agent = "That isn't a wallet address (0x followed by 40 characters).";
  if (!form.sameZg && form.zgAccount && !isAddress(form.zgAccount, { strict: false })) errors.zgAccount = "That isn't a 0G address.";
  if (form.endpoint) {
    let url: URL | null = null;
    try {
      url = new URL(form.endpoint);
    } catch {}
    const local = config?.allowLocalEndpoints && url?.protocol === "http:";
    if (!url || /\s/.test(form.endpoint) || form.endpoint.length > 200) errors.endpoint = "Enter the full URL customers call.";
    else if (url.protocol !== "https:" && !local) errors.endpoint = "The endpoint must use https.";
  }
  const cost = Number(form.cost);
  if (!(cost > 0 && cost <= 1)) errors.cost = "Enter the AI cost of one job in dollars, between $0.000001 and $1.";
  const complete = Boolean(form.agent && form.endpoint && (form.sameZg || form.zgAccount));
  return { errors, ok: complete && Object.keys(errors).length === 0 };
}

/** Enrol an agent for credit: wallet, ID, collateral approval, details, then one signature. */
export function EnrolFlow() {
  const params = useSearchParams();
  const wallet = useWallet();
  const address = wallet.status === "connected" ? wallet.address : null;
  const config = usePoll<EnrolConfig>("/api/enrol/config", 300_000);
  const owner = usePoll<OwnerView>(address ? `/api/owners/${address}` : null, 10_000);
  const [picked, setPicked] = useState<number | null>(() => (/^\d{1,9}$/.test(params.get("agent") ?? "") ? Number(params.get("agent")) : null));
  const readiness = usePoll<Readiness>(address ? `/api/enrol/readiness?owner=${address}${picked !== null ? `&agentId=${picked}` : ""}` : null, 5000);
  const [registered, setRegistered] = useState<number[]>([]);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [form, setForm] = useState<Form>({ agent: "", zgAccount: "", sameZg: true, endpoint: "", incomeFrom: "none", cost: "0.01" });
  const agentLookup = usePoll<Readiness>(
    address && form.incomeFrom === "agent" && isAddress(form.agent, { strict: false }) ? `/api/enrol/readiness?owner=${address}&agent=${form.agent}` : null,
    30_000,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ step: string; message: string } | null>(null);
  // The server's job for the chosen agent, so a reload mid-enrolment still shows its progress.
  const job = usePoll<{ job: Job<EnrolResult> | null }>(address && picked !== null ? `/api/enrol/${picked}` : null, 2000);

  const cfg = config.data;
  const r = readiness.data;
  const current = job.data?.job;
  const enrolled = current?.state === "done" ? current : null;
  const onHedera = wallet.chainId === HEDERA_TESTNET;
  const walletDone = Boolean(address && onHedera && r?.account && r.hbar >= MIN_HBAR && r.usdcReady);
  const enrolledIds = new Set((owner.data?.agents ?? []).map((a) => a.agentId));
  const candidates = [...new Set([...(owner.data?.unenrolled ?? []).map((u) => u.agentId), ...registered])]
    .filter((id) => !enrolledIds.has(id))
    .sort((a, b) => a - b);
  const idDone = Boolean(enrolled) || (walletDone && picked !== null && r?.agentId === picked && r.ownsId === true && r.enrolled === false);
  const collateralDone = Boolean(enrolled) || (idDone && r?.collateralApproved === true);
  const { errors, ok: detailsOk } = validate(form, cfg);
  const incomeAccount = form.incomeFrom === "owner" ? r?.account ?? "" : form.incomeFrom === "agent" ? agentLookup.data?.agentAccount ?? "" : "";
  const incomeReady = form.incomeFrom === "none" || Boolean(incomeAccount);
  const detailsDone = Boolean(enrolled) || (collateralDone && detailsOk && incomeReady);

  const state = (done: boolean, ready: boolean): StepState => (done ? "done" : ready ? "current" : "locked");

  async function act(step: string, work: () => Promise<void>) {
    setBusy(step);
    setProblem(null);
    try {
      await work();
    } catch (error) {
      setProblem({ step, message: error instanceof ApiError ? error.message : walletError(error) });
    } finally {
      setBusy(null);
    }
  }

  const register = () =>
    act("id", async () => {
      if (!cfg) return;
      const { agentId } = await registerAgent(cfg, registrationUri(newName.trim(), newDescription.trim()));
      setRegistered((ids) => [...ids, agentId]);
      setPicked(agentId);
      owner.reload();
    });

  const approve = () =>
    act("collateral", async () => {
      if (!cfg) return;
      await approveCollateral(cfg);
      readiness.reload();
    });

  const submit = () =>
    act("submit", async () => {
      if (!cfg || picked === null) return;
      if (!onHedera) await switchToHedera();
      const agent = getAddress(form.agent);
      const message = {
        agentId: picked,
        agent,
        zgAccount: form.sameZg ? agent : getAddress(form.zgAccount),
        endpoint: form.endpoint.trim(),
        incomeAccount,
        aiCostPerJob: Math.round(Number(form.cost) * 1_000_000),
        issuedAt: Math.floor(Date.now() / 1000),
      };
      const signature = await signRequest(cfg, "Enrol", message);
      await postJson("/api/enrol", { ...message, signature });
      job.reload();
    });

  const problemFor = (step: string) => (problem?.step === step ? <Problem>{problem.message}</Problem> : null);

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-8 sm:px-6">
      <Crumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Enrol an agent" }]} />
      <h1 className="font-serif text-[44px] leading-[1.02] text-paper sm:text-[52px]">Enrol an agent for credit</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fog">
        Five steps. Your agent gets an income contract that repays its loans from what customers pay, and a credit line that opens once a credit
        check finds enough real income.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-3">
        <Step
          n={1}
          title="Connect your wallet on Hedera testnet"
          state={state(walletDone || Boolean(enrolled), true)}
          summary={walletDone && r ? `${short(address ?? "")} · Hedera account ${r.account} · ${r.hbar.toFixed(2)} HBAR` : undefined}
        >
          {!walletDone && (
            <div>
              {wallet.status === "loading" ? (
                <Skeleton className="h-10 w-48" />
              ) : wallet.status === "none" ? (
                <p className="text-[14px] text-fog">
                  No wallet found in this browser.{" "}
                  <a href="https://metamask.io/download" target="_blank" rel="noreferrer" className="text-paper underline underline-offset-4">
                    Install MetaMask
                  </a>{" "}
                  to continue.
                </p>
              ) : !address ? (
                <button onClick={connectWallet} disabled={wallet.status === "connecting"} className={primary}>
                  <Wallet size={15} /> {wallet.status === "connecting" ? "Waiting for the wallet…" : `Connect ${wallet.walletName ?? "wallet"}`}
                </button>
              ) : !onHedera ? (
                <div>
                  <p className="text-[14px] text-fog">Your wallet is on another network. Enrolling happens on Hedera testnet.</p>
                  <button onClick={() => act("wallet", switchToHedera)} disabled={busy !== null} className={`${primary} mt-3`}>
                    Switch to Hedera testnet
                  </button>
                </div>
              ) : !r ? (
                <Skeleton className="h-10 w-64" />
              ) : !r.account || r.hbar < MIN_HBAR ? (
                <div>
                  <p className="text-[14px] text-fog">
                    {r.account
                      ? `Your account ${r.account} has ${r.hbar.toFixed(2)} HBAR. Registering and approving your agent's ID take two small transactions, so top up to at least ${MIN_HBAR} HBAR.`
                      : "This address isn't on Hedera testnet yet. Sending it free test HBAR creates its account."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={FAUCET} target="_blank" rel="noreferrer" className={primary}>
                      Get test HBAR
                    </a>
                    <button onClick={readiness.reload} className={secondary}>
                      I&apos;ve funded it
                    </button>
                  </div>
                  <Hint>Paste {short(address)} into the faucet. It takes a few seconds to arrive.</Hint>
                </div>
              ) : (
                <p className="text-[14px] text-fog">
                  Your account {r.account} can&apos;t receive USDC yet, so your share of the agent&apos;s income couldn&apos;t reach you. In your wallet, associate
                  token {cfg?.usdc}, then refresh.
                </p>
              )}
              {wallet.error && <Problem>{wallet.error}</Problem>}
              {problemFor("wallet")}
            </div>
          )}
        </Step>

        <Step
          n={2}
          title="Choose your agent's ID"
          state={state(idDone, walletDone)}
          summary={idDone ? `Agent #${picked}, its ERC-8004 identity, owned by this wallet` : undefined}
        >
          {enrolled ? null : idDone ? (
            <button onClick={() => setPicked(null)} className="text-[13px] text-paper underline underline-offset-4">
              Choose another
            </button>
          ) : (
            <div>
              {candidates.length > 0 && (
                <div role="radiogroup" aria-label="Your agent IDs" className="flex flex-wrap gap-2">
                  {candidates.map((id) => (
                    <button
                      key={id}
                      role="radio"
                      aria-checked={picked === id}
                      onClick={() => setPicked(id)}
                      className={`rounded-xl border px-3.5 py-2 text-[14px] font-semibold transition ${
                        picked === id ? "border-paper bg-paper text-ink" : "border-ink-line text-paper hover:border-fog"
                      }`}
                    >
                      Agent #{id}
                    </button>
                  ))}
                </div>
              )}
              {picked !== null && r?.agentId === picked && r.exists === false && <Problem>Agent #{picked} doesn&apos;t exist.</Problem>}
              {picked !== null && r?.agentId === picked && r.exists && !r.ownsId && <Problem>This wallet doesn&apos;t own agent #{picked}.</Problem>}
              {picked !== null && r?.agentId === picked && r.enrolled && (
                <Problem>
                  Agent #{picked} is already enrolled.{" "}
                  <Link href={`/agents/${picked}`} className="underline underline-offset-4">
                    Open it
                  </Link>
                </Problem>
              )}

              <div className={candidates.length > 0 ? "mt-5 border-t border-ink-line pt-5" : ""}>
                <div className="text-[14px] font-semibold text-paper">{candidates.length > 0 ? "Or register a new one" : "Register your agent's ID"}</div>
                <Hint>This mints your agent&apos;s ERC-8004 identity, the on-chain ID that stands as collateral, to your wallet.</Hint>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[12.5px] text-fog">Agent name</span>
                    <input value={newName} onChange={(e) => setNewName(e.target.value.slice(0, 60))} placeholder="Translation agent" className={`${input} mt-1 font-sans`} />
                  </label>
                  <label className="block">
                    <span className="text-[12.5px] text-fog">What it does (optional)</span>
                    <input
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value.slice(0, 160))}
                      placeholder="Translates text between English and Hindi"
                      className={`${input} mt-1 font-sans`}
                    />
                  </label>
                </div>
                <button onClick={register} disabled={!newName.trim() || busy !== null || !cfg} className={`${secondary} mt-3`}>
                  <Plus size={15} /> {busy === "id" ? "Confirm in your wallet…" : "Register a new agent ID"}
                </button>
                {problemFor("id")}
              </div>
            </div>
          )}
        </Step>

        <Step
          n={3}
          title="Let the credit line hold your ID while the agent owes"
          state={state(collateralDone, idDone)}
          summary={collateralDone ? "Approved: the ID moves only when the agent borrows, and comes back when it repays" : undefined}
        >
          {!collateralDone && (
            <div>
              <p className="text-[14px] leading-relaxed text-fog">
                The ID stays in your wallet. When your agent borrows, the credit line holds it, and it comes back automatically once the loan is
                repaid. If the agent doesn&apos;t repay, or redirects its income, the lender keeps it. This one approval covers all your agents.
              </p>
              <Hint>
                MetaMask shows this as a withdrawal request, because it lets the credit line move your agent IDs. It only does so when one of
                your agents borrows.
              </Hint>
              <button onClick={approve} disabled={busy !== null || !cfg} className={`${primary} mt-3`}>
                {busy === "collateral" ? "Confirm in your wallet…" : "Approve"}
              </button>
              {problemFor("collateral")}
            </div>
          )}
        </Step>

        <Step n={4} title="Tell us about your agent" state={state(detailsDone, collateralDone)} summary={enrolled ? "Signed and recorded on Arkiv" : undefined}>
          {!enrolled && (
          <div className="grid gap-4">
            <label className="block">
              <span className="text-[13px] text-paper">Agent wallet</span>
              <input value={form.agent} onChange={(e) => setForm({ ...form, agent: e.target.value.trim() })} placeholder="0x…" className={`${input} mt-1`} />
              <Hint>The wallet your agent signs loan requests with. Only this wallet can borrow on the line.</Hint>
              {errors.agent && <Problem>{errors.agent}</Problem>}
            </label>
            <div>
              <label className="flex items-center gap-2 text-[13px] text-paper">
                <input type="checkbox" checked={form.sameZg} onChange={(e) => setForm({ ...form, sameZg: e.target.checked })} className="accent-[#ff5b2e]" />
                Its 0G compute account is the same address
              </label>
              {!form.sameZg && (
                <input value={form.zgAccount} onChange={(e) => setForm({ ...form, zgAccount: e.target.value.trim() })} placeholder="0x… on 0G" className={`${input} mt-2`} />
              )}
              <Hint>Loans are paid straight into this account on 0G, where they can only be spent on AI.</Hint>
              {errors.zgAccount && <Problem>{errors.zgAccount}</Problem>}
            </div>
            <label className="block">
              <span className="text-[13px] text-paper">Paid endpoint</span>
              <input
                value={form.endpoint}
                onChange={(e) => setForm({ ...form, endpoint: e.target.value.trim() })}
                placeholder="https://your-agent.example.com/translate"
                className={`${input} mt-1`}
              />
              <Hint>The x402 URL customers pay per job, in USDC on Hedera testnet. We check it answers with its price.</Hint>
              {errors.endpoint && <Problem>{errors.endpoint}</Problem>}
            </label>
            <fieldset>
              <legend className="text-[13px] text-paper">Where have customers paid it so far?</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["none", "Nowhere yet"],
                    ["agent", "Its own wallet"],
                    ["owner", `My wallet${r?.account ? ` (${r.account})` : ""}`],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-[13px] transition ${
                      form.incomeFrom === value ? "border-paper bg-paper text-ink" : "border-ink-line text-paper hover:border-fog"
                    }`}
                  >
                    <input type="radio" name="income" value={value} checked={form.incomeFrom === value} onChange={() => setForm({ ...form, incomeFrom: value })} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
              <Hint>The credit check counts this past income too, after tracing where each customer&apos;s money came from.</Hint>
              {form.incomeFrom === "agent" && isAddress(form.agent, { strict: false }) && agentLookup.data && !agentLookup.data.agentAccount && (
                <Problem>The agent wallet isn&apos;t on Hedera testnet, so it has no past income to count.</Problem>
              )}
            </fieldset>
            <label className="block sm:max-w-xs">
              <span className="text-[13px] text-paper">AI cost per job (USD)</span>
              <input value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value.trim() })} inputMode="decimal" className={`${input} mt-1`} />
              <Hint>What one job costs your agent in AI compute. Each job must earn at least 20% more than this.</Hint>
              {errors.cost && <Problem>{errors.cost}</Problem>}
            </label>
          </div>
          )}
        </Step>

        <Step n={5} title="Sign and enrol" state={enrolled ? "done" : detailsDone ? "current" : "locked"}>
          {!current || current.state === "failed" ? (
            <div>
              <p className="text-[14px] leading-relaxed text-fog">
                Your wallet asks you to sign agent #{picked}&apos;s details. Signing is free and sends nothing. We then deploy its income contract, bind it
                to the credit line, open its line with no credit yet and publish your signed application on Arkiv.
              </p>
              <button onClick={submit} disabled={!detailsDone || busy !== null} className={`${primary} mt-3`}>
                {busy === "submit" ? "Sign in your wallet…" : "Sign and enrol"}
              </button>
              {problemFor("submit")}
              {current?.state === "failed" && (
                <div className="mt-4">
                  <JobProgress job={current} />
                </div>
              )}
            </div>
          ) : enrolled ? (
            <div>
              <p className="text-[15px] font-semibold text-paper">Agent #{enrolled.agentId} is enrolled.</p>
              <div className="mt-4 rounded-xl border border-ink-line bg-ink p-4">
                <div className="text-[13px] text-fog">Its income contract</div>
                <div className="mt-2">
                  <CopyValue value={enrolled.result.splitterId} />
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-paper">
                  Next, set your endpoint&apos;s x402 <span className="font-mono">payTo</span> to {enrolled.result.splitterId}. Every payment then repays
                  loans first and sends the rest to you.
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-fog">
                  Once a few customers have paid it, run a credit check on your agent&apos;s page. The check needs income from at least three independent
                  customers.
                </p>
              </div>
              {enrolled.result.warning && <p className="mt-3 text-[13px] text-fog">{enrolled.result.warning}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link href={`/agents/${enrolled.agentId}`} className={primary}>
                  Open agent #{enrolled.agentId} <ArrowRight size={15} />
                </Link>
                <ExtLink href={enrolled.result.lineTx}>line opened on Hedera</ExtLink>
              </div>
            </div>
          ) : (
            <JobProgress job={current} />
          )}
        </Step>
      </div>
    </div>
  );
}

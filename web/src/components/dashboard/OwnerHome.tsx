"use client";

import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import { usePoll, type Contracts } from "@/lib/api";
import { connectWallet, useWallet } from "@/lib/wallet";
import { Card, Skeleton } from "../console/ui";
import { Lookup } from "./Lookup";
import { OwnerView } from "./OwnerView";

/** The owner dashboard: your agents once a wallet is connected, otherwise a way in. */
export function OwnerHome() {
  const wallet = useWallet();
  const contracts = usePoll<Contracts>("/api/contracts", 60000);
  if (wallet.status === "connected" && wallet.address) return <OwnerView owner={wallet.address} />;
  const demoOwner = contracts.data?.demoOwner;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
      <div className="font-mono text-[12px] uppercase tracking-[0.1em] text-fog">Owner dashboard</div>
      <h1 className="mt-3 max-w-3xl font-serif text-[44px] leading-[1.02] text-paper sm:text-[56px]">Your agents, their credit and every repayment.</h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-fog">
        See each agent&apos;s limit, what it owes, where its ID is and every loan and repayment, read live from the chains.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col p-6">
          <h2 className="font-serif text-[28px] leading-none text-paper">Connect your wallet</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-fog">
            Use the wallet that owns your agents&apos; IDs. Connecting only shares its address with this page; nothing is signed or sent.
          </p>
          <div className="mt-auto pt-6">
            {wallet.status === "loading" ? (
              <Skeleton className="h-11 w-48" />
            ) : wallet.status === "none" ? (
              <p className="text-[14px] text-fog">
                No wallet found in this browser.{" "}
                <a href="https://metamask.io/download" target="_blank" rel="noreferrer" className="text-paper underline underline-offset-4">
                  Install MetaMask
                </a>
                , or look up an owner below.
              </p>
            ) : (
              <button
                onClick={connectWallet}
                disabled={wallet.status === "connecting"}
                className="inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-3 text-[15px] font-semibold text-ink transition hover:brightness-110 disabled:opacity-50"
              >
                <Wallet size={16} aria-hidden="true" />
                {wallet.status === "connecting" ? "Waiting for the wallet…" : `Connect ${wallet.walletName ?? "wallet"}`}
              </button>
            )}
            {wallet.error && <p className="mt-3 text-[13px] text-signal">{wallet.error}</p>}
          </div>
        </Card>

        <Card className="flex flex-col p-6">
          <h2 className="font-serif text-[28px] leading-none text-paper">See the demo owner</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-fog">
            This owner runs the live translation agent, which borrows during a rush and repays from its income, and two test agents that
            broke the rules and lost their IDs.
          </p>
          <div className="mt-auto pt-6">
            {demoOwner ? (
              <Link
                href={`/owners/${demoOwner}`}
                className="inline-flex items-center gap-2 rounded-xl border border-ink-line px-5 py-3 text-[15px] font-semibold text-paper transition hover:border-fog"
              >
                Open the demo owner <ArrowRight size={16} aria-hidden="true" />
              </Link>
            ) : contracts.error ? (
              <p className="text-[14px] text-fog">Can&apos;t reach the console API right now.</p>
            ) : (
              <Skeleton className="h-11 w-56" />
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-6">
        <Lookup />
      </Card>
    </div>
  );
}

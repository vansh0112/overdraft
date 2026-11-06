"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { short } from "@/lib/format";
import { connectWallet, useWallet } from "@/lib/wallet";

/** Connect button in the header; once connected it shows the address and opens the owner's dashboard. */
export function WalletButton() {
  const wallet = useWallet();
  if (wallet.status === "connected" && wallet.address) {
    return (
      <Link
        href="/dashboard"
        className="hidden items-center gap-2 rounded-xl border border-ink-line px-3 py-1.5 font-mono text-[12.5px] text-paper transition hover:border-fog sm:inline-flex"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
        {short(wallet.address)}
      </Link>
    );
  }
  if (wallet.status !== "disconnected" && wallet.status !== "connecting") return null;
  return (
    <button
      onClick={connectWallet}
      disabled={wallet.status === "connecting"}
      className="hidden items-center gap-2 rounded-xl border border-ink-line px-3 py-1.5 text-[13px] font-semibold text-paper transition hover:border-fog disabled:opacity-50 sm:inline-flex"
    >
      <Wallet size={14} aria-hidden="true" />
      {wallet.status === "connecting" ? "Connecting…" : "Connect wallet"}
    </button>
  );
}

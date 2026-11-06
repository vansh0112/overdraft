"use client";

import { useEffect, useSyncExternalStore } from "react";

/** A browser wallet as wallets expose it (EIP-1193). */
type Provider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, listener: (value: unknown) => void): void;
};

type Announced = { info: { rdns: string; name: string }; provider: Provider };

export type WalletState = {
  /** loading: still looking for a wallet; none: no wallet in this browser. */
  status: "loading" | "none" | "disconnected" | "connecting" | "connected";
  address: string | null;
  walletName: string | null;
  error: string | null;
};

const REMEMBER_KEY = "overdraft.wallet";
const initial: WalletState = { status: "loading", address: null, walletName: null, error: null };
let state = initial;
let provider: Provider | null = null;
let started = false;
const listeners = new Set<() => void>();

function update(patch: Partial<WalletState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function remember(on: boolean) {
  try {
    if (on) localStorage.setItem(REMEMBER_KEY, "1");
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {}
}

function remembered(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

function onAccounts(value: unknown) {
  const accounts = Array.isArray(value) ? (value as string[]) : [];
  if (accounts.length) {
    update({ status: "connected", address: accounts[0], error: null });
  } else {
    remember(false);
    update({ status: "disconnected", address: null });
  }
}

function errorMessage(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: number; message?: string };
  if (code === 4001) return "The wallet declined the request.";
  if (code === -32002) return "Your wallet already has a request waiting. Open it to continue.";
  return message ?? "Couldn't reach the wallet.";
}

/** Finds the wallet once: announced wallets first (EIP-6963), preferring MetaMask, then window.ethereum. */
function start() {
  if (started) return;
  started = true;
  const found: Announced[] = [];
  const onAnnounce = (event: Event) => found.push((event as CustomEvent<Announced>).detail);
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  // Wallets usually answer at once; the wait covers extensions that load late.
  setTimeout(async () => {
    window.removeEventListener("eip6963:announceProvider", onAnnounce);
    const pick = found.find((w) => w.info.rdns === "io.metamask") ?? found[0];
    provider = pick?.provider ?? (window as { ethereum?: Provider }).ethereum ?? null;
    if (!provider) {
      update({ status: "none" });
      return;
    }
    update({ status: "disconnected", walletName: pick?.info.name ?? "your wallet" });
    provider.on?.("accountsChanged", onAccounts);
    if (remembered()) {
      try {
        onAccounts(await provider.request({ method: "eth_accounts" }));
      } catch {
        // Locked or busy: the owner can connect again by hand.
      }
    }
  }, 300);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The connected wallet, shared by every component on the page. Connecting only reads the address. */
export function useWallet(): WalletState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => initial);
  useEffect(start, []);
  return snapshot;
}

export async function connectWallet() {
  if (!provider) return;
  update({ status: "connecting", error: null });
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    remember(true);
    onAccounts(accounts);
  } catch (error) {
    update({ status: "disconnected", error: errorMessage(error) });
  }
}

export async function disconnectWallet() {
  remember(false);
  update({ status: "disconnected", address: null, error: null });
  try {
    await provider?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch {
    // Not every wallet supports revoking; forgetting it here is enough.
  }
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createWalletClient, custom, type Address, type EIP1193Provider } from "viem";
import { hederaTestnet } from "viem/chains";

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
  /** The network the wallet is on; enrolling needs Hedera testnet (296). */
  chainId: number | null;
  walletName: string | null;
  error: string | null;
};

const REMEMBER_KEY = "overdraft.wallet";
const initial: WalletState = { status: "loading", address: null, chainId: null, walletName: null, error: null };
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

/** A wallet or viem error in plain words. */
export function walletError(error: unknown): string {
  const { code, shortMessage, message, cause } = (error ?? {}) as { code?: number; shortMessage?: string; message?: string; cause?: { code?: number } };
  if (code === 4001 || cause?.code === 4001) return "You declined the request in your wallet.";
  if (code === -32002) return "Your wallet already has a request waiting. Open it to continue.";
  return shortMessage ?? message ?? "Couldn't reach the wallet.";
}

async function readChain() {
  try {
    update({ chainId: Number(await provider?.request({ method: "eth_chainId" })) });
  } catch {
    // Some wallets only answer once unlocked; chainChanged fills it in later.
  }
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
    provider.on?.("chainChanged", (value) => update({ chainId: Number(value) }));
    if (remembered()) {
      try {
        onAccounts(await provider.request({ method: "eth_accounts" }));
        await readChain();
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
    await readChain();
  } catch (error) {
    update({ status: "disconnected", error: walletError(error) });
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

const HEDERA_TESTNET_HEX = `0x${hederaTestnet.id.toString(16)}`;

/** Asks the wallet to switch to Hedera testnet, adding the network first if it doesn't know it. */
export async function switchToHedera() {
  if (!provider) throw new Error("Connect your wallet first.");
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: HEDERA_TESTNET_HEX }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: HEDERA_TESTNET_HEX,
          chainName: "Hedera Testnet",
          nativeCurrency: hederaTestnet.nativeCurrency,
          rpcUrls: hederaTestnet.rpcUrls.default.http,
          blockExplorerUrls: [hederaTestnet.blockExplorers.default.url],
        },
      ],
    });
  }
  await readChain();
}

function refusedForAccount(error: unknown): boolean {
  for (let e = error as { code?: number; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (e.code === 4100) return true;
  }
  return false;
}

/**
 * Runs a transaction or signature, asking for the account again if the wallet refuses it as unauthorized.
 *
 * MetaMask grants a site its accounts per network. A site connected on another network and then switched to
 * a newly added Hedera testnet is allowed the network but not the account on it, and every request fails with
 * 4100 until the account is granted there too. One more connect prompt fixes it.
 */
export async function withAccountPermission<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!provider || !refusedForAccount(error)) throw error;
    await provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
    return work();
  }
}

/** Signs and sends through the connected wallet, on Hedera testnet. */
export function walletClient() {
  if (!provider || !state.address) throw new Error("Connect your wallet first.");
  return createWalletClient({ account: state.address as Address, chain: hederaTestnet, transport: custom(provider as EIP1193Provider) });
}

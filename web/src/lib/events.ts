import type { ActivityEvent, ActivityKind } from "./api";
import { usd } from "./format";

/** How each kind of on-chain event reads in a log: a short tag, its colour, and one line of detail. */
export type Tone = "accent" | "ok" | "info" | "violet" | "muted";

export const EVENT_TAG: Record<ActivityKind, { tag: string; tone: Tone; label: string }> = {
  payment: { tag: "x402", tone: "info", label: "Customer paid" },
  loan: { tag: "credit", tone: "accent", label: "Borrowed" },
  deposit: { tag: "0g", tone: "violet", label: "Into 0G compute" },
  split: { tag: "split", tone: "info", label: "Income split" },
  released: { tag: "repaid", tone: "ok", label: "Repaid" },
  locked: { tag: "lock", tone: "accent", label: "ID locked" },
  limit: { tag: "limit", tone: "muted", label: "Limit set" },
  breach: { tag: "breach", tone: "accent", label: "Breach" },
  default: { tag: "default", tone: "accent", label: "Default" },
};

export const TONE_TEXT: Record<Tone, string> = {
  accent: "text-accent",
  ok: "text-ok",
  info: "text-info",
  violet: "text-violet",
  muted: "text-muted",
};

export function eventLine(e: ActivityEvent): string {
  switch (e.kind) {
    case "payment":
      return `paid ${usd(e.amountUsd)}${e.payer ? ` · from ${e.payer}` : ""}`;
    case "loan":
      return `borrowed ${usd(e.amountUsd)} of compute · owed ${usd(e.owedAfterUsd)}`;
    case "deposit":
      return e.simulated ? `dry-run depositFor → ${e.amount0G?.toFixed(3)} 0G` : "deposited into 0G compute";
    case "split":
      return `lender ${usd(e.toLenderUsd)} · compute ${usd(e.toComputeUsd)} · owner ${usd(e.toOwnerUsd)}`;
    case "released":
      return "debt cleared · ID returned to its owner";
    default:
      return e.title.charAt(0).toLowerCase() + e.title.slice(1);
  }
}

/** The signed amount an event moves, from the agent's point of view, when it has one. */
export function eventAmount(e: ActivityEvent): { text: string; tone: Tone } | null {
  switch (e.kind) {
    case "payment":
      return { text: `+${(e.amountUsd ?? 0).toFixed(3)}`, tone: "ok" };
    case "loan":
      return { text: `+${(e.amountUsd ?? 0).toFixed(3)}`, tone: "accent" };
    case "split":
      return e.owedAfterUsd !== undefined ? { text: `owed ${e.owedAfterUsd.toFixed(3)}`, tone: e.owedAfterUsd === 0 ? "ok" : "muted" } : null;
    default:
      return null;
  }
}

export function clock(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Dollar amounts: cents for bigger values, a tenth of a cent below a dollar (testnet loans are small). */
export function usd(value: number | undefined | null, digits?: number): string {
  if (value === undefined || value === null) return "–";
  const d = digits ?? (Math.abs(value) >= 1 ? 2 : 3);
  return `$${value.toFixed(d)}`;
}

/** USDC atomic units (6 decimals) to dollars. */
export function atomic(value: number): number {
  return value / 1_000_000;
}

export function ago(seconds: number, now = Date.now() / 1000): string {
  const s = Math.max(0, Math.round(now - seconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function date(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function short(value: string, head = 6, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

import Link from "next/link";

/** The mark: a balance line that dips below zero and comes back, with the dip marked in signal. */
export function Mark({ size = 28, tone = "ink" }: { size?: number; tone?: "ink" | "paper" }) {
  const box = tone === "ink" ? "#0f1a2a" : "#f3eee4";
  const line = tone === "ink" ? "#f3eee4" : "#0f1a2a";
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill={box} />
      <path d="M5 12h4c2 0 2.6 6 5 6s3-9 5-9h4" fill="none" stroke={line} strokeWidth="2" strokeLinecap="round" />
      <circle cx="14" cy="18" r="2.2" fill="#ff5b2e" />
    </svg>
  );
}

export function Logo({ tone = "ink" }: { tone?: "ink" | "paper" }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Overdraft home">
      <Mark tone={tone === "ink" ? "ink" : "paper"} />
      <span className="font-serif text-[23px] leading-none tracking-[-0.01em]">Overdraft</span>
    </Link>
  );
}

const links = [
  { href: "/console", label: "Console" },
  { href: "/docs", label: "Docs" },
  { href: "https://github.com/vansh0112/overdraft", label: "GitHub" },
];

/** Site navigation. `surface` is the background it sits on. */
export function Nav({ surface = "paper", children }: { surface?: "paper" | "ink"; children?: React.ReactNode }) {
  const onInk = surface === "ink";
  return (
    <header className={onInk ? "border-b border-ink-line bg-ink text-paper" : "border-b border-paper-line bg-paper text-ink"}>
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-6 px-4 sm:px-6">
        <Logo tone={onInk ? "paper" : "ink"} />
        <nav className="flex items-center gap-5 text-sm">
          {children}
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={onInk ? "text-fog transition hover:text-paper" : "text-slate transition hover:text-ink"}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function Footer({ surface = "paper" }: { surface?: "paper" | "ink" }) {
  const onInk = surface === "ink";
  return (
    <footer className={onInk ? "border-t border-ink-line bg-ink text-fog" : "border-t border-paper-line bg-paper text-slate"}>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm sm:px-6">
        <div className="flex items-center gap-2.5">
          <Mark size={20} tone={onInk ? "paper" : "ink"} />
          <span>Overdraft · credit lines for AI agents · built at ETHGlobal Mumbai 2026</span>
        </div>
        <span className="font-mono text-xs">Hedera testnet · 0G mainnet · Arkiv Rabdi</span>
      </div>
    </footer>
  );
}

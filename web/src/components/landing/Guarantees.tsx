import { Spotlight } from "@/components/system/Spotlight";

function Tile({ visual, title, text, className = "" }: { visual: React.ReactNode; title: string; text: React.ReactNode; className?: string }) {
  return (
    <Spotlight className={`reveal flex flex-col overflow-hidden rounded-3xl border border-line bg-surface ${className}`}>
      <div className="dots relative grid min-h-[176px] flex-1 place-items-center border-b border-line px-5 py-6">{visual}</div>
      <div className="p-6">
        <h3 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{text}</p>
      </div>
    </Spotlight>
  );
}

/** The loan can only become compute: the path to a wallet is closed. */
function ComputeOnly() {
  const node = "rounded-lg border border-line-2 bg-surface px-2.5 py-1.5 font-mono text-[11px]";
  return (
    <div className="grid w-full max-w-[300px] grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-1.5">
      <span className={`${node} text-fg`}>loan</span>
      <svg viewBox="0 0 40 8" className="h-2 w-full" aria-hidden="true">
        <line x1="0" y1="4" x2="40" y2="4" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 4" className="march" />
      </svg>
      <span className={`${node} text-fg`}>vault</span>
      <svg viewBox="0 0 40 8" className="h-2 w-full" aria-hidden="true">
        <line x1="0" y1="4" x2="40" y2="4" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 4" className="march" />
      </svg>
      <span className={`${node} border-accent/50 text-accent`}>compute</span>
      <span />
      <span />
      <span className="flex flex-col items-center gap-1 pt-2">
        <svg viewBox="0 0 8 22" className="h-5 w-2" aria-hidden="true">
          <line x1="4" y1="0" x2="4" y2="22" stroke="var(--line-2)" strokeWidth="1.5" strokeDasharray="3 3" />
        </svg>
        <span className="rounded-lg border border-dashed border-line-2 px-2.5 py-1.5 font-mono text-[11px] text-faint line-through">wallet</span>
      </span>
    </div>
  );
}

/** Each payment splits, and the lender's share comes off the top until nothing is owed. */
function LenderFirst() {
  const parts = [
    { label: "lender", value: "0.036", width: "30%", color: "bg-accent", delay: "0s" },
    { label: "compute", value: "0.024", width: "20%", color: "bg-violet", delay: ".15s" },
    { label: "owner", value: "0.060", width: "50%", color: "bg-ok", delay: ".3s" },
  ];
  return (
    <div className="w-full max-w-[300px]">
      <div className="flex items-baseline justify-between font-mono text-[11px] text-muted">
        <span>customer paid</span>
        <span className="text-fg">$0.120</span>
      </div>
      <div className="mt-2 flex h-3 gap-[3px] overflow-hidden rounded-full">
        {parts.map((p) => (
          <span key={p.label} className={`grow-x h-full rounded-full ${p.color}`} style={{ width: p.width, animationDelay: p.delay }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10.5px]">
        {parts.map((p) => (
          <span key={p.label} className="flex flex-col gap-0.5">
            <span className="text-faint">{p.label}</span>
            <span className="text-fg">{p.value}</span>
          </span>
        ))}
      </div>
      <div className="mt-3 border-t border-line pt-2 font-mono text-[10.5px] text-faint">lender first, until owed = 0</div>
    </div>
  );
}

/** The agent's ID card, locked while it owes and handed back when it doesn't. */
function IdCard() {
  return (
    <div className="relative aspect-[1.586] w-full max-w-[240px] -rotate-3 overflow-hidden rounded-2xl border border-line-2 bg-gradient-to-br from-surface-3 via-surface to-surface-2 p-4 shadow-[var(--shadow)] transition-transform duration-500 hover:rotate-0">
      <div className="sheen absolute inset-0" aria-hidden="true" />
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">ERC-8004</span>
        <span className="relative h-5 w-[86px] font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em]">
          <span className="swap-a absolute inset-0 grid place-items-center rounded-full bg-accent text-accent-ink">locked</span>
          <span className="swap-b absolute inset-0 grid place-items-center rounded-full bg-ok text-accent-ink">returned</span>
        </span>
      </div>
      <div className="mt-4 h-6 w-8 rounded-md bg-gradient-to-br from-[#e7c48a] to-[#b8893f] opacity-90" aria-hidden="true" />
      <div className="absolute inset-x-4 bottom-4 flex items-end justify-between">
        <div>
          <div className="font-mono text-[15px] tracking-[0.14em]">AGENT 0140</div>
          <div className="mt-0.5 text-[10px] text-faint">held by the credit line</div>
        </div>
        <svg width="20" height="20" viewBox="0 0 28 28" aria-hidden="true">
          <path d="M5 12h4c2 0 2.6 6 5 6s3-9 5-9h4" fill="none" stroke="var(--text)" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="14" cy="18" r="2.6" fill="var(--accent)" />
        </svg>
      </div>
    </div>
  );
}

/** A refused applicant: its "customers" were funded by its own owner, so their payments don't count. */
function Trace() {
  const nodes = [
    { x: 40, y: 80, label: "owner", sub: "0x79Fe…" },
    { x: 190, y: 30, label: "wallet A", sub: "0.0.4471" },
    { x: 190, y: 130, label: "wallet B", sub: "0.0.4472" },
    { x: 360, y: 80, label: "agent #142", sub: "earning?" },
  ];
  const edges = [
    "M58 74 C 110 40, 130 32, 168 30",
    "M58 86 C 110 120, 130 128, 168 130",
    "M212 30 C 270 32, 300 56, 338 76",
    "M212 130 C 270 128, 300 104, 338 84",
  ];
  return (
    <div className="relative w-full max-w-[440px]">
      <svg viewBox="0 0 400 200" className="w-full overflow-visible" aria-hidden="true">
        {edges.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="5 5" className="march" opacity={i < 2 ? 0.9 : 0.6} />
        ))}
        <path d="M360 100 C 330 205, 70 205, 40 100" fill="none" stroke="var(--line-2)" strokeWidth="1.2" strokeDasharray="3 4" />
        <text x="200" y="196" textAnchor="middle" fontSize="10" fill="var(--faint)" fontFamily="var(--font-mono)">
          the money came from the owner
        </text>
        {nodes.map((n) => (
          <g key={n.label}>
            <circle cx={n.x} cy={n.y} r="16" fill="var(--surface)" stroke={n.label === "owner" ? "var(--accent)" : "var(--line-2)"} strokeWidth="1.5" />
            <circle cx={n.x} cy={n.y} r="4" fill={n.label === "owner" ? "var(--accent)" : "var(--muted)"} />
            <text x={n.x} y={n.y - 24} textAnchor="middle" fontSize="11" fill="var(--text)" fontFamily="var(--font-mono)">
              {n.label}
            </text>
            <text x={n.x} y={n.y + 32} textAnchor="middle" fontSize="9.5" fill="var(--faint)" fontFamily="var(--font-mono)">
              {n.sub}
            </text>
          </g>
        ))}
      </svg>
      <span className="stamp absolute right-0 top-0 rotate-[8deg] rounded-md border-2 border-accent px-2 py-0.5 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-accent">
        refused
      </span>
    </div>
  );
}

export function Guarantees() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Tile visual={<ComputeOnly />} title="Loans become compute, never cash" text="The money goes straight into the agent's 0G compute account. There's no path to a wallet, so a loan can only be spent on serving customers." />
      <Tile visual={<LenderFirst />} title="Income repays first" text="Customers pay a split contract. While the agent owes, the lender's share comes off the top of every payment, automatically." />
      <Tile visual={<IdCard />} title="Its ID is the collateral" text="The agent's ERC-8004 identity is held by the credit line while it owes, and returned when it's paid off. Default, and the lender keeps it." />
      <Spotlight className="reveal grid overflow-hidden rounded-3xl border border-line bg-surface md:col-span-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col justify-center p-6 sm:p-8">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">Before any credit</span>
          <h3 className="mt-3 text-[22px] font-semibold leading-tight tracking-[-0.03em] sm:text-[26px]">Fake income is traced and refused.</h3>
          <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-muted">
            Underwriting follows each customer&apos;s money back several hops. Payments funded by the owner don&apos;t count, and every decision, approved or refused, is published to Arkiv for any lender to read.
          </p>
        </div>
        <div className="dots grid place-items-center border-t border-line p-6 sm:p-8 md:border-l md:border-t-0">
          <Trace />
        </div>
      </Spotlight>
    </div>
  );
}

import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-2xl border border-ink-line bg-ink-2 ${className}`}>{children}</section>;
}

export function SectionTitle({ title, hint, right }: { title: string; hint?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
      <div>
        <h2 className="font-serif text-[26px] leading-none text-paper">{title}</h2>
        {hint && <p className="mt-2 max-w-xl text-[13px] text-fog">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

type Tone = "neutral" | "signal" | "outline" | "quiet";

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  const tones: Record<Tone, string> = {
    neutral: "bg-paper/10 text-paper",
    signal: "bg-signal text-ink",
    outline: "border border-signal text-signal",
    quiet: "border border-ink-line text-fog",
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${tones[tone]}`}>{children}</span>;
}

export function ExtLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-fog underline-offset-4 transition hover:text-paper hover:underline ${className}`}>
      {children}
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}

export function Stat({ label, value, sub, accent = false }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div>
      <div className="text-[12px] text-fog">{label}</div>
      <div className={`tabular mt-1 font-mono text-[26px] font-semibold leading-none ${accent ? "text-signal" : "text-paper"}`}>{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-fog">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink-3 ${className}`} />;
}

export function LiveDot({ on }: { on: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${on ? "live-dot bg-signal" : "bg-fog/50"}`} aria-hidden="true" />;
}

export function Crumbs({ items }: { items: { label: React.ReactNode; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-fog">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={13} aria-hidden="true" />}
          {item.href ? (
            <Link href={item.href} className="transition hover:text-paper">
              {item.label}
            </Link>
          ) : (
            <span className="text-paper" aria-current="page">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

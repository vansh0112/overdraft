import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-2xl border border-line bg-surface transition-colors hover:border-line-2 ${className}`}>{children}</section>;
}

/** A small mono label above a value or a block. */
export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint ${className}`}>{children}</div>;
}

export function SectionTitle({ title, hint, right }: { title: string; hint?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-fg">{title}</h2>
        {hint && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

type Tone = "neutral" | "signal" | "outline" | "quiet" | "ok";

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  const tones: Record<Tone, string> = {
    neutral: "border-line-2 bg-surface-2 text-fg",
    signal: "border-accent/30 bg-accent/12 text-accent",
    outline: "border-accent/50 text-accent",
    quiet: "border-line text-muted",
    ok: "border-ok/30 bg-ok/12 text-ok",
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function ExtLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-muted underline-offset-4 transition hover:text-fg hover:underline ${className}`}>
      {children}
      <ArrowUpRight size={12} aria-hidden="true" />
    </a>
  );
}

export function Stat({ label, value, sub, accent = false }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <div className={`tabular mt-2 font-mono text-[22px] font-semibold leading-none tracking-[-0.02em] sm:text-[26px] ${accent ? "text-accent" : "text-fg"}`}>{value}</div>
      {sub && <div className="mt-1.5 text-[12px] leading-snug text-muted">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

export function LiveDot({ on }: { on: boolean }) {
  return on ? <span className="status-dot text-ok" aria-hidden="true" /> : <span className="inline-block h-2 w-2 rounded-full bg-faint" aria-hidden="true" />;
}

export function Crumbs({ items }: { items: { label: React.ReactNode; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 font-mono text-[11.5px] text-faint">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={12} aria-hidden="true" />}
          {item.href ? (
            <Link href={item.href} className="transition hover:text-fg">
              {item.label}
            </Link>
          ) : (
            <span className="text-muted" aria-current="page">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** A page's title block: a status line, the title, and a line of context underneath. */
export function PageHead({ status, title, sub, right }: { status?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="enter flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        {status && <div className="flex items-center gap-2 font-mono text-[11.5px] text-muted">{status}</div>}
        <h1 className="display mt-3 text-[40px] sm:text-[54px]">{title}</h1>
        {sub && <div className="mt-3 flex flex-wrap items-center gap-2 text-[14px] text-muted">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, Search, X } from "lucide-react";
import { DEPLOYMENTS } from "@/lib/deployments";
import { CommandPalette, openPalette } from "@/components/system/CommandPalette";
import { Signature } from "@/components/system/Signature";
import { ThemeToggle } from "@/components/system/ThemeToggle";

const DEMO = `/agents/${DEPLOYMENTS.demoAgentId}`;
const GITHUB = "https://github.com/vansh0112/overdraft";

/** The mark: a balance line that dips below zero and comes back, with the dip marked in the accent. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect x=".5" y=".5" width="27" height="27" rx="7" fill="var(--surface-2)" stroke="var(--line-2)" />
      <path d="M5 12h4c2 0 2.6 6 5 6s3-9 5-9h4" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="14" cy="18" r="2.2" fill="var(--accent)" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Overdraft home">
      <span className="transition-transform duration-300 group-hover:-rotate-6">
        <Mark />
      </span>
      <span className="text-[16px] font-semibold tracking-[-0.025em]">Overdraft</span>
    </Link>
  );
}

const links = [
  { href: DEMO, label: "Live demo", match: (p: string) => p === DEMO },
  { href: "/dashboard", label: "Dashboard", match: (p: string) => p.startsWith("/dashboard") || p.startsWith("/owners") },
  { href: "/agents", label: "Agents", match: (p: string) => p.startsWith("/agents") && p !== DEMO },
  { href: "/enrol", label: "Enrol", match: (p: string) => p.startsWith("/enrol") },
  { href: "/docs", label: "Docs", match: (p: string) => p.startsWith("/docs") },
];

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

/** The main links, the current page marked. A null pathname (while the address streams in) marks none. */
function MainLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="hidden items-center gap-0.5 text-[13.5px] md:flex">
      {links.map((l) => {
        const active = pathname !== null && l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-lg px-3 py-1.5 transition ${active ? "text-fg" : "text-muted hover:text-fg"}`}
          >
            {l.label}
            {active && <span className="absolute inset-x-3 -bottom-[11px] h-px bg-accent" aria-hidden="true" />}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate: () => void }) {
  return (
    <>
      {links.map((l) => {
        const active = pathname !== null && l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between rounded-xl px-3 py-3 text-[16px] transition ${active ? "bg-surface-2 text-fg" : "text-muted"}`}
          >
            {l.label}
            {active && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
          </Link>
        );
      })}
    </>
  );
}

// The address is only known at request time, so these render inside Suspense and the rest of the page prerenders.
function ActiveMainLinks() {
  return <MainLinks pathname={usePathname() ?? "/"} />;
}

function ActiveMobileLinks({ onNavigate }: { onNavigate: () => void }) {
  return <MobileLinks pathname={usePathname() ?? "/"} onNavigate={onNavigate} />;
}

/** Site navigation: sticky and translucent, the current page marked, ⌘K search, theme switch, a sheet menu on phones. */
export function Nav({ children, cta = true }: { children?: React.ReactNode; cta?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Logo />
          <Suspense fallback={<MainLinks pathname={null} />}>
            <ActiveMainLinks />
          </Suspense>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={openPalette}
            className="hidden h-9 items-center gap-2 rounded-lg border border-line bg-surface/60 pl-2.5 pr-1.5 text-[13px] text-faint transition hover:border-line-2 hover:text-muted lg:flex"
          >
            <Search size={14} aria-hidden="true" />
            <span className="pr-6">Find an agent…</span>
            <kbd className="rounded-md border border-line-2 bg-canvas-2 px-1.5 font-mono text-[10.5px]">⌘K</kbd>
          </button>
          <button type="button" onClick={openPalette} aria-label="Search" className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg lg:hidden">
            <Search size={16} />
          </button>
          <ThemeToggle />
          <a href={GITHUB} target="_blank" rel="noreferrer" aria-label="Source code on GitHub" className="hidden h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg sm:grid">
            <GitHubIcon />
          </a>
          {children}
          {cta && (
            <Link href="/enrol" className="ml-1 hidden h-9 items-center rounded-lg bg-fg px-3.5 text-[13px] font-semibold text-canvas transition hover:opacity-85 sm:inline-flex">
              Enrol an agent
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg md:hidden"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-menu" className="border-t border-line md:hidden" style={{ animation: "rise .25s cubic-bezier(.2,.7,.2,1) both" }}>
          <nav aria-label="Mobile" className="mx-auto grid max-w-[1240px] gap-0.5 px-3 py-3">
            <Suspense fallback={<MobileLinks pathname={null} onNavigate={() => setOpen(false)} />}>
              <ActiveMobileLinks onNavigate={() => setOpen(false)} />
            </Suspense>
            <a href={GITHUB} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-xl px-3 py-3 text-[16px] text-muted">
              GitHub <ArrowUpRight size={15} />
            </a>
          </nav>
        </div>
      )}
      <CommandPalette />
    </header>
  );
}

const columns = [
  {
    title: "Product",
    items: [
      { href: DEMO, label: "Live demo" },
      { href: "/dashboard", label: "Owner dashboard" },
      { href: "/enrol", label: "Enrol an agent" },
      { href: "/agents", label: "All agents" },
    ],
  },
  {
    title: "Developers",
    items: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs#borrow", label: "Borrow from code" },
      { href: "/docs#addresses", label: "Contracts" },
      { href: GITHUB, label: "GitHub", external: true },
    ],
  },
  {
    title: "Runs on",
    items: [
      { href: "https://hashscan.io/testnet", label: "Hedera testnet", external: true },
      { href: "https://chainscan.0g.ai", label: "0G (simulated)", external: true },
      { href: "https://rabdi.explorer.arkiv.network", label: "Arkiv Rabdi", external: true },
      { href: "https://eips.ethereum.org/EIPS/eip-8004", label: "ERC-8004", external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-line bg-canvas">
      <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-x-6 gap-y-10 px-4 pb-10 pt-14 sm:grid-cols-3 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="col-span-2 sm:col-span-3 md:col-span-1">
          <Logo />
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-muted">Credit lines for AI agents. Loans in compute, repaid from what customers pay, secured by the agent&apos;s own ID.</p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-[11px] text-muted">
            <span className="status-dot text-ok" aria-hidden="true" />
            testnet · live
          </p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{c.title}</div>
            <ul className="mt-4 space-y-2.5 text-[14px]">
              {c.items.map((i) => (
                <li key={i.label}>
                  {"external" in i && i.external ? (
                    <a href={i.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted transition hover:text-fg">
                      {i.label} <ArrowUpRight size={12} aria-hidden="true" />
                    </a>
                  ) : (
                    <Link href={i.href} className="text-muted transition hover:text-fg">
                      {i.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-5 text-[12.5px] text-faint">
          <span>Built at ETHGlobal Mumbai 2026 · testnet money only</span>
          <span className="font-mono">Hedera · 0G · Arkiv · ERC-8004</span>
        </div>
      </div>
      <Signature />
    </footer>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Command, CornerDownLeft, Hash, LayoutDashboard, Plus, Radio, Search, Server, Wallet } from "lucide-react";
import { DEPLOYMENTS } from "@/lib/deployments";

type Item = { id: string; label: string; hint: string; href: string; icon: typeof Search; keywords?: string };

const PAGES: Item[] = [
  { id: "demo", label: "Live demo", hint: `Agent #${DEPLOYMENTS.demoAgentId}`, href: `/agents/${DEPLOYMENTS.demoAgentId}`, icon: Radio, keywords: "console watch live rush" },
  { id: "dash", label: "Owner dashboard", hint: "Your agents", href: "/dashboard", icon: LayoutDashboard, keywords: "wallet my agents" },
  { id: "enrol", label: "Enrol an agent", hint: "Five steps", href: "/enrol", icon: Plus, keywords: "apply sign up credit" },
  { id: "agents", label: "All agents", hint: "Directory", href: "/agents", icon: Server, keywords: "list registry" },
  { id: "docs", label: "Documentation", hint: "How it works", href: "/docs", icon: BookOpen, keywords: "help guide" },
  { id: "borrow", label: "Borrow from code", hint: "Docs", href: "/docs#borrow", icon: BookOpen, keywords: "sdk viem web3 requestDraw" },
  { id: "contracts", label: "Contracts and addresses", hint: "Docs", href: "/docs#addresses", icon: BookOpen, keywords: "hedera 0g arkiv" },
];

function dynamic(query: string): Item[] {
  const q = query.trim().replace(/^#/, "");
  if (/^\d{1,9}$/.test(q)) return [{ id: `agent-${q}`, label: `Open agent #${Number(q)}`, hint: "Agent", href: `/agents/${Number(q)}`, icon: Hash }];
  if (/^0x[0-9a-fA-F]{40}$/.test(q) || /^0\.0\.\d{1,12}$/.test(q)) return [{ id: `owner-${q}`, label: `Open owner ${q.slice(0, 10)}…`, hint: "Owner", href: `/owners/${q}`, icon: Wallet }];
  return [];
}

/** ⌘K / Ctrl+K: jump to any page, agent (type its number) or owner (paste an address). */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("overdraft:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("overdraft:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 10);
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = q ? PAGES.filter((p) => `${p.label} ${p.hint} ${p.keywords ?? ""}`.toLowerCase().includes(q)) : PAGES;
    return [...dynamic(query), ...pages];
  }, [query]);

  function go(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    setQuery("");
    setIndex(0);
    router.push(item.href);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command menu">
      <button aria-label="Close" className="absolute inset-0 bg-canvas/70 backdrop-blur-sm" style={{ animation: "fade .15s ease both" }} onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-[var(--shadow)]" style={{ animation: "rise .2s cubic-bezier(.2,.7,.2,1) both" }}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={16} className="text-faint" aria-hidden="true" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                go(items[index]);
              }
            }}
            placeholder="Jump to a page, an agent number or an owner address…"
            aria-label="Search"
            className="h-14 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-faint"
          />
          <kbd className="rounded-md border border-line-2 px-1.5 py-0.5 font-mono text-[10.5px] text-faint">esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {items.length === 0 && <li className="px-3 py-6 text-center text-[13.5px] text-muted">No match. Try an agent number like 140.</li>}
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <li key={item.id} role="option" aria-selected={i === index}>
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(item)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] transition ${i === index ? "bg-surface-2 text-fg" : "text-muted"}`}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-canvas-2">
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <span className="flex-1">{item.label}</span>
                  <span className="font-mono text-[11px] text-faint">{item.hint}</span>
                  {i === index && <CornerDownLeft size={14} className="text-faint" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 font-mono text-[11px] text-faint">
          <span className="flex items-center gap-1.5">
            <Command size={12} aria-hidden="true" />K to open anywhere
          </span>
          <span>↑ ↓ to move · enter to open</span>
        </div>
      </div>
    </div>
  );
}

export function openPalette() {
  window.dispatchEvent(new Event("overdraft:palette"));
}

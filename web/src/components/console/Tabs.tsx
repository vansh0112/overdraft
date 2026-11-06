"use client";

import { useId, useState } from "react";

export type Tab = { id: string; label: string; count?: number; content: React.ReactNode };

/** Tabs in a card: one panel at a time, switched with a click or the arrow keys. */
export function Tabs({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const base = useId();
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  function onKey(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tabs[(index + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    setActive(next.id);
    document.getElementById(`${base}-${next.id}`)?.focus();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line px-3 [scrollbar-width:none]">
        {tabs.map((t, i) => {
          const on = t.id === current?.id;
          return (
            <button
              key={t.id}
              id={`${base}-${t.id}`}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`${base}-${t.id}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`relative flex shrink-0 items-center gap-2 px-3 py-3.5 text-[13.5px] transition focus-visible:outline-offset-[-6px] ${on ? "text-fg" : "text-muted hover:text-fg"}`}
            >
              {t.label}
              {t.count !== undefined && <span className={`rounded-md px-1.5 font-mono text-[10.5px] ${on ? "bg-surface-3 text-fg" : "bg-surface-2 text-faint"}`}>{t.count}</span>}
              <span className={`absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent transition-transform duration-300 ${on ? "scale-x-100" : "scale-x-0"}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {current && (
        <div key={current.id} id={`${base}-${current.id}-panel`} role="tabpanel" aria-labelledby={`${base}-${current.id}`} style={{ animation: "fade .25s ease both" }}>
          {current.content}
        </div>
      )}
    </section>
  );
}

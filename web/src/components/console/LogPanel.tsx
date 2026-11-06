"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type LogFilter<T> = { id: string; label: string; match: (item: T) => boolean };

/**
 * A long list in a fixed-height panel: filter chips with counts, a column header that stays put, rows that scroll
 * inside the panel, and a fade at the bottom while there is more to see.
 */
export function LogPanel<T>({
  items,
  filters,
  columns,
  grid,
  row,
  rowKey,
  intro,
  empty,
  loading,
  height = 460,
  order = "newest first",
}: {
  items: T[] | null;
  filters: LogFilter<T>[];
  columns: React.ReactNode;
  grid: string;
  row: (item: T) => React.ReactNode;
  rowKey: (item: T) => string;
  intro?: React.ReactNode;
  empty: string;
  loading: boolean;
  height?: number;
  /** How the rows are ordered, said in the footer. */
  order?: string;
}) {
  const [active, setActive] = useState(filters[0]?.id ?? "all");
  const [atEnd, setAtEnd] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => Object.fromEntries(filters.map((f) => [f.id, (items ?? []).filter(f.match).length])), [filters, items]);
  const filter = filters.find((f) => f.id === active) ?? filters[0];
  const shown = useMemo(() => (items ?? []).filter(filter.match), [items, filter]);

  // The bottom fade shows only while there are rows below the fold.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [shown.length]);

  function choose(id: string) {
    setActive(id);
    scroller.current?.scrollTo({ top: 0 });
  }

  return (
    <div>
      {intro && <p className="px-5 pt-4 text-[13px] leading-relaxed text-muted">{intro}</p>}
      <div className="flex gap-1.5 overflow-x-auto px-5 py-3 [scrollbar-width:none]" role="group" aria-label="Filter">
        {filters.map((f) =>
          f.id !== filters[0].id && counts[f.id] === 0 ? null : (
            <button
              key={f.id}
              type="button"
              onClick={() => choose(f.id)}
              aria-pressed={f.id === filter.id}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] transition ${
                f.id === filter.id ? "border-line-2 bg-surface-3 text-fg" : "border-line text-muted hover:border-line-2 hover:text-fg"
              }`}
            >
              {f.label}
              <span className="font-mono text-[10.5px] text-faint">{counts[f.id]}</span>
            </button>
          ),
        )}
      </div>
      <div
        ref={scroller}
        className="scroll-thin relative overflow-y-auto overscroll-contain border-t border-line"
        style={{
          maxHeight: height,
          maskImage: atEnd ? undefined : "linear-gradient(to bottom, #000 calc(100% - 56px), transparent)",
          WebkitMaskImage: atEnd ? undefined : "linear-gradient(to bottom, #000 calc(100% - 56px), transparent)",
        }}
        tabIndex={0}
        aria-label="Records"
      >
        <div className={`sticky top-0 z-10 hidden gap-x-3 border-b border-line bg-surface/95 px-5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint backdrop-blur sm:grid ${grid}`}>{columns}</div>
        <ul className="divide-y divide-line font-mono text-[12.5px]">
          {loading && !items && Array.from({ length: 6 }, (_, i) => <li key={i} className="px-5 py-3"><div className="skeleton h-5 rounded" /></li>)}
          {items && shown.length === 0 && <li className="px-5 py-10 text-center font-sans text-[14px] text-muted">{empty}</li>}
          {shown.map((item) => (
            <li key={rowKey(item)}>{row(item)}</li>
          ))}
        </ul>
      </div>
      {items && items.length > 0 && (
        <div className="flex items-center justify-between border-t border-line px-5 py-2.5 font-mono text-[11px] text-faint">
          <span>
            {shown.length === items.length ? `${items.length}` : `${shown.length} of ${items.length}`} · {order}
          </span>
          {!atEnd && <span>scroll for more ↓</span>}
        </div>
      )}
    </div>
  );
}

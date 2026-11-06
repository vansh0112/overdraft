"use client";

import { useEffect, useState } from "react";

/** The docs sidebar: the section being read is marked as you scroll. */
export function DocsNav({ sections }: { sections: readonly (readonly [string, string])[] }) {
  const [current, setCurrent] = useState<string>(sections[0][0]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    sections.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="sticky top-24 text-[13.5px]" aria-label="Docs sections">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">On this page</div>
      <ul className="mt-4 border-l border-line">
        {sections.map(([id, label]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={current === id ? "location" : undefined}
              className={`-ml-px block border-l py-1.5 pl-4 transition ${current === id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

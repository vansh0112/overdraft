"use client";

import type { PointerEvent, ReactNode } from "react";

/** A card whose border lights up where the pointer is. The effect itself is CSS (.spotlight); this only tracks the pointer. */
export function Spotlight({ className = "", children, as: Tag = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "li" | "article" }) {
  function move(e: PointerEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--y", `${e.clientY - rect.top}px`);
  }
  return (
    <Tag onPointerMove={move} className={`spotlight ${className}`}>
      {children}
    </Tag>
  );
}

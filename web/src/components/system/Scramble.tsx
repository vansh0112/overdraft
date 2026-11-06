"use client";

import { useEffect, useState } from "react";

const GLYPHS = "01$#%&*+<>/=_ABCDEFX";

/**
 * Text that decodes from random glyphs into place, left to right, like a terminal resolving a value.
 * Each word keeps the width of its final form, so nothing around it shifts while it decodes.
 */
export function Scramble({ text, delay = 350, duration = 1000, className = "" }: { text: string; delay?: number; duration?: number; className?: string }) {
  const [settled, setSettled] = useState(text.length);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.max(0, now - start - delay) / duration;
      setSettled(Math.floor(Math.min(1, t) * text.length));
      setTick(Math.floor(now / 50));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text, delay, duration]);

  const words = text.split(" ");
  const starts = words.map((_, w) => words.slice(0, w).join(" ").length + (w ? 1 : 0));
  return (
    <span className={className} aria-label={text}>
      {words.map((word, w) => {
        const first = starts[w];
        const shown = word
          .split("")
          .map((ch, i) => (first + i < settled ? ch : GLYPHS[((first + i) * 7 + tick) % GLYPHS.length]))
          .join("");
        return (
          <span key={w} aria-hidden="true">
            {w > 0 && " "}
            <span className="relative inline-block">
              <span className="invisible">{word}</span>
              <span className="absolute inset-0 overflow-hidden whitespace-nowrap">{shown}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

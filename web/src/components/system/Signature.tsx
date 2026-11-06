"use client";

import { useEffect, useRef } from "react";
import { Great_Vibes } from "next/font/google";

const script = Great_Vibes({ weight: "400", subsets: ["latin"] });

const W = 1200;
const H = 330;
const FEATHER = 160;
const DASH = 3000;

/**
 * "overdraft" in handwriting, written left to right as the footer scrolls into view: the pen outline leads and the
 * ink fills in behind it. It finishes as the page reaches its end; with reduced motion it is simply there.
 */
export function Signature() {
  const root = useRef<HTMLDivElement>(null);
  const pen = useRef<SVGLinearGradientElement>(null);
  const ink = useRef<SVGLinearGradientElement>(null);
  const outline = useRef<SVGTextElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const paint = (p: number) => {
      const edge = -FEATHER + p * (W + FEATHER * 2);
      pen.current?.setAttribute("x1", String(edge - FEATHER));
      pen.current?.setAttribute("x2", String(edge));
      ink.current?.setAttribute("x1", String(edge - FEATHER * 3));
      ink.current?.setAttribute("x2", String(edge - FEATHER));
      outline.current?.setAttribute("stroke-dashoffset", String(DASH * (1 - p)));
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(1);
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const progress = (window.innerHeight - rect.top) / rect.height;
        paint(Math.min(1, Math.max(0, progress)));
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const text = {
    x: W / 2,
    y: H * 0.6,
    textAnchor: "middle" as const,
    fontSize: 300,
    textLength: W * 0.86,
    lengthAdjust: "spacingAndGlyphs" as const,
    style: { fontFamily: script.style.fontFamily },
  };

  return (
    <div ref={root} aria-hidden="true" className="pointer-events-none select-none px-4 pb-16 sm:pb-20">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[1240px] overflow-visible">
        <defs>
          <linearGradient ref={pen} id="sig-pen" gradientUnits="userSpaceOnUse" x1={-FEATHER * 2} x2={-FEATHER} y1="0" y2="0">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" stopColor="#000" />
          </linearGradient>
          <linearGradient ref={ink} id="sig-ink" gradientUnits="userSpaceOnUse" x1={-FEATHER * 4} x2={-FEATHER * 3} y1="0" y2="0">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" stopColor="#000" />
          </linearGradient>
          <mask id="sig-pen-mask" maskUnits="userSpaceOnUse" x="0" y="-40" width={W} height={H + 80}>
            <rect x="0" y="-40" width={W} height={H + 80} fill="url(#sig-pen)" />
          </mask>
          <mask id="sig-ink-mask" maskUnits="userSpaceOnUse" x="0" y="-40" width={W} height={H + 80}>
            <rect x="0" y="-40" width={W} height={H + 80} fill="url(#sig-ink)" />
          </mask>
        </defs>
        <text {...text} fill="var(--line-2)" opacity="0.55" mask="url(#sig-ink-mask)">
          overdraft
        </text>
        <text ref={outline} {...text} fill="none" stroke="var(--muted)" strokeWidth="1.2" strokeDasharray={DASH} strokeDashoffset={DASH} mask="url(#sig-pen-mask)">
          overdraft
        </text>
      </svg>
    </div>
  );
}

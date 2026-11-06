"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Coins, Cpu, Hourglass, Layers } from "lucide-react";

/** Where the agent's net position is at each moment of one rush: budget, overdrawn on credit, then back in the black. */
const KEYS: [number, number][] = [
  [0, 0.55],
  [0.1, 0.48],
  [0.28, 0],
  [0.47, -0.6],
  [0.6, -0.78],
  [0.68, -0.68],
  [0.88, 0],
  [1, 0.32],
];

function value(t: number): number {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
  const [x0, y0] = KEYS[i];
  const [x1, y1] = KEYS[i + 1];
  const prev = KEYS[Math.max(0, i - 1)];
  const next = KEYS[Math.min(KEYS.length - 1, i + 2)];
  const span = x1 - x0 || 1;
  const u = Math.min(1, Math.max(0, (t - x0) / span));
  const m0 = ((y1 - prev[1]) / (x1 - prev[0] || 1)) * span;
  const m1 = ((next[1] - y0) / (next[0] - x0 || 1)) * span;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * m1;
}

const W = 1000;
const H = 240;
const y = (v: number) => H / 2 - v * 96;
const POINTS = Array.from({ length: 121 }, (_, i) => [(i / 120) * W, y(value(i / 120))] as const);
const CURVE = POINTS.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
const AREA = `${CURVE} L${W} ${H / 2} L0 ${H / 2} Z`;

const STEPS = [
  { at: 0.06, icon: Coins, title: "Paid", chip: "x402 · Hedera", text: "Customers pay $0.02 a job. Every payment lands in the agent's split contract." },
  { at: 0.28, icon: Hourglass, title: "Short", chip: "the agent", text: "A rush: eight jobs waiting, budget for two. Without credit, six customers walk." },
  { at: 0.47, icon: Cpu, title: "Borrowed", chip: "0G · simulated", text: "It draws on its line. The loan goes straight into its compute account, nowhere else." },
  { at: 0.66, icon: Layers, title: "Served", chip: "ERC-8004", text: "All eight jobs done. Its ID stays locked with the credit line while it owes." },
  { at: 0.88, icon: CircleCheck, title: "Repaid", chip: "Hedera", text: "Each payment pays the lender first until the debt is zero. The ID comes home." },
];

const DURATION = 5000;
const HOLD = 1400;

/** One rush, animated: the net balance dips into credit and recovers while each step lights up as it happens. */
export function RushPipeline() {
  const root = useRef<HTMLDivElement>(null);
  const reveal = useRef<SVGRectElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(STEPS.length - 1);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const paint = (p: number) => {
      reveal.current?.setAttribute("width", String(p * W));
      if (marker.current) {
        marker.current.style.left = `${p * 100}%`;
        marker.current.style.top = `${(y(value(p)) / H) * 100}%`;
        marker.current.dataset.side = value(p) < 0 ? "debt" : "ok";
      }
      let current = -1;
      STEPS.forEach((s, i) => {
        if (p >= s.at - 0.02) current = i;
      });
      setActive(current);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(1);
      return;
    }
    let frame = 0;
    let start = 0;
    let visible = false;
    const loop = (now: number) => {
      if (!start) start = now;
      const t = (now - start) % (DURATION + HOLD);
      paint(Math.min(1, t / DURATION));
      if (visible) frame = requestAnimationFrame(loop);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible) {
        start = 0;
        frame = requestAnimationFrame(loop);
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={root} className="overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="relative border-b border-line px-3 pb-4 pt-10 sm:px-6">
        <div className="absolute left-4 top-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint sm:left-6">
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-sm bg-ok/70" aria-hidden="true" /> in budget
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-sm bg-accent/80" aria-hidden="true" /> running on credit
          </span>
        </div>
        <div className="relative aspect-[1000/460] w-full sm:aspect-[1000/240]">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id="rush-up" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--ok)" stopOpacity=".32" />
                <stop offset="1" stopColor="var(--ok)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="rush-down" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="var(--accent)" stopOpacity=".42" />
                <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
              <clipPath id="rush-above">
                <rect x="0" y="0" width={W} height={H / 2} />
              </clipPath>
              <clipPath id="rush-below">
                <rect x="0" y={H / 2} width={W} height={H / 2} />
              </clipPath>
              <clipPath id="rush-reveal">
                <rect ref={reveal} x="0" y="-20" width={W} height={H + 40} />
              </clipPath>
            </defs>
            {STEPS.map((s) => (
              <line key={s.title} x1={s.at * W} x2={s.at * W} y1="0" y2={H} stroke="var(--line)" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
            ))}
            <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--line-2)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={CURVE} fill="none" stroke="var(--line-2)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            {/* Line, shading and marker share one left-to-right reveal, so they always move together. */}
            <g clipPath="url(#rush-reveal)">
              <path d={AREA} fill="url(#rush-up)" clipPath="url(#rush-above)" />
              <path d={AREA} fill="url(#rush-down)" clipPath="url(#rush-below)" />
              <path d={CURVE} fill="none" stroke="var(--text)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
          <span className="absolute right-0 top-1/2 -translate-y-[130%] font-mono text-[10px] text-faint">$0</span>
          <div
            ref={marker}
            data-side="ok"
            className="group absolute left-full top-[37%] -translate-x-1/2 -translate-y-1/2 text-ok data-[side=debt]:text-accent"
            aria-hidden="true"
          >
            <span className="status-dot block h-3 w-3 ring-4 ring-surface" />
          </div>
          <span className="absolute left-[60%] top-[90%] hidden -translate-x-1/2 font-mono text-[11px] text-accent sm:block">owed $0.09</span>
          <span className="absolute right-0 top-[8%] hidden font-mono text-[11px] text-ok sm:block">back in the black</span>
        </div>
      </div>
      <ol className="grid divide-y divide-line sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const on = i <= active;
          const now = i === active;
          return (
            <li key={s.title} className={`relative flex gap-4 px-4 py-4 transition-colors duration-500 sm:block sm:p-5 ${now ? "bg-surface-2" : ""}`}>
              <span
                className={`absolute inset-x-0 top-0 h-px origin-left transition-transform duration-500 ${on ? "scale-x-100" : "scale-x-0"} ${i === STEPS.length - 1 ? "bg-ok" : "bg-accent"}`}
                aria-hidden="true"
              />
              <div className="flex shrink-0 items-start justify-between">
                <span
                  className={`grid h-8 w-8 place-items-center rounded-lg border transition-colors duration-500 ${on ? (i === STEPS.length - 1 ? "border-ok/40 text-ok" : "border-accent/40 text-accent") : "border-line text-faint"}`}
                >
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span className="hidden font-mono text-[10.5px] text-faint sm:inline">0{i + 1}</span>
              </div>
              <div className="min-w-0">
                <h3 className={`text-[15.5px] font-semibold tracking-[-0.02em] transition-colors duration-500 sm:mt-4 sm:text-[16px] ${on ? "text-fg" : "text-muted"}`}>{s.title}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted sm:mt-1.5">{s.text}</p>
                <span className="mt-3 hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-faint sm:inline-block">{s.chip}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

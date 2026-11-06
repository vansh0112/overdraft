"use client";

import { useEffect, useRef, useState } from "react";

/** A number that counts up the first time it scrolls into view, then follows live changes smoothly. */
export function CountUp({ value, format, duration = 900 }: { value: number; format: (n: number) => string; duration?: number }) {
  // Mounted only on the client, once data has arrived; reduced motion shows the number straight away.
  const [shown, setShown] = useState(() => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? value : 0));
  const from = useRef(0);
  const seen = useRef(false);
  const node = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = node.current;
    if (!el) return;
    let frame = 0;
    const run = () => {
      const start = performance.now();
      const begin = from.current;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const step = (now: number) => {
        const t = reduced ? 1 : Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(begin + (value - begin) * eased);
        if (t < 1) frame = requestAnimationFrame(step);
        else from.current = value;
      };
      frame = requestAnimationFrame(step);
    };
    if (seen.current) {
      run();
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        seen.current = true;
        observer.disconnect();
        run();
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={node} className="tabular">
      {format(shown)}
    </span>
  );
}

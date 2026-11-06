/** The idea in one picture: an agent's AI budget dips below zero in a rush, a loan covers it, income repays it. */
export function BudgetChart() {
  // x: time, y: budget (zero line at y=150). Below zero is the overdraft the loan covers.
  const path = "M20 92 C70 92 95 96 120 104 S170 128 190 170 S232 214 262 206 S300 150 330 118 S400 84 450 80 S520 78 560 78";
  return (
    <figure className="relative rounded-2xl border border-paper-line bg-paper-2/60 p-5">
      <figcaption className="flex items-center justify-between text-[12px] text-slate">
        <span className="font-mono uppercase tracking-[0.08em]">AI budget during a rush</span>
        <span>illustration</span>
      </figcaption>
      <svg viewBox="0 0 580 250" className="mt-3 w-full" role="img" aria-label="The budget falls below zero during a rush of orders, a loan covers the gap, and income brings it back up">
        <defs>
          <clipPath id="below-zero">
            <rect x="0" y="150" width="580" height="100" />
          </clipPath>
        </defs>
        <line x1="20" y1="150" x2="560" y2="150" stroke="#0f1a2a" strokeOpacity="0.35" strokeDasharray="4 5" />
        <text x="560" y="143" textAnchor="end" className="fill-slate font-mono" fontSize="11">$0</text>
        <path d={`${path} L560 150 L20 150 Z`} fill="#ff5b2e" fillOpacity="0.16" clipPath="url(#below-zero)" />
        <path d={path} fill="none" stroke="#0f1a2a" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="236" cy="211" r="6" fill="#ff5b2e" />
        {[
          { x: 120, y: 82, label: "a rush of paid orders" },
          { x: 236, y: 238, label: "short: borrows the gap" },
          { x: 450, y: 64, label: "income repays the loan" },
        ].map((n) => (
          <text key={n.label} x={n.x} y={n.y} textAnchor="middle" fontSize="12.5" className="fill-ink">
            {n.label}
          </text>
        ))}
      </svg>
    </figure>
  );
}

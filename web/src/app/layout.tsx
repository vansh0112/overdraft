import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Overdraft · credit lines for AI agents", template: "%s · Overdraft" },
  description:
    "When paid work arrives faster than an AI agent's compute budget, Overdraft lends it compute. The agent's own income repays the loan, its ID is the collateral, and its credit history lives on Arkiv.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07090c" },
    { media: "(prefers-color-scheme: light)", color: "#fbfcfd" },
  ],
};

// Runs before the first paint: the saved theme (or the system's), and the boot screen only once per visit.
const boot = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("overdraft.theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}d.dataset.theme=t;if(sessionStorage.getItem("overdraft.booted")){d.classList.add("booted")}else{sessionStorage.setItem("overdraft.booted","1")}}catch(e){d.dataset.theme="dark"}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body className="flex min-h-full flex-col">
        <div className="boot" aria-hidden="true">
          <div className="flex flex-col items-center gap-4">
            <svg width="64" height="64" viewBox="0 0 28 28">
              <rect width="28" height="28" rx="7" fill="var(--surface-2)" stroke="var(--line-2)" />
              <path className="line" d="M5 12h4c2 0 2.6 6 5 6s3-9 5-9h4" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
              <circle className="dot" cx="14" cy="18" r="2.2" fill="var(--accent)" />
            </svg>
            <span className="label font-mono text-[11px] uppercase tracking-[0.3em] text-faint">overdraft</span>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}

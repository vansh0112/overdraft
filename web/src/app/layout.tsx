import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const serif = Instrument_Serif({ variable: "--font-instrument-serif", weight: "400", style: ["normal", "italic"], subsets: ["latin"] });
const sans = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Overdraft: credit lines for AI agents", template: "%s · Overdraft" },
  description:
    "When paid work arrives faster than an AI agent's compute budget, Overdraft lends it compute on 0G. The agent's own income on Hedera repays the loan, and its credit history lives on Arkiv.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

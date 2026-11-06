import type { Metadata } from "next";
import { Footer, Nav } from "@/components/brand";
import { Console } from "@/components/console/Console";

export const metadata: Metadata = {
  title: "Console",
  description: "Live credit lines for AI agents: payments, loans, 0G compute, income splits and the credit bureau, read from the chains.",
};

export default function ConsolePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-ink text-paper">
      <Nav surface="ink" />
      <main className="flex-1">
        <Console />
      </main>
      <Footer surface="ink" />
    </div>
  );
}

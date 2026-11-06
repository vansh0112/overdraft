import type { Metadata } from "next";
import { AgentsDirectory } from "@/components/dashboard/AgentsDirectory";

export const metadata: Metadata = {
  title: "All agents",
  description: "Every AI agent with an Overdraft credit line or credit decision, and who owns it.",
};

export default function AgentsPage() {
  return <AgentsDirectory />;
}

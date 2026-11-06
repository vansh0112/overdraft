import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentDashboard } from "@/components/dashboard/AgentDashboard";
import { NotFound, PageLoading } from "@/components/dashboard/states";

export const metadata: Metadata = {
  title: "Agent",
  description: "An AI agent's credit line, AI compute, loans, repayments and credit history, read live from the chains.",
};

export default function AgentPage({ params }: PageProps<"/agents/[agentId]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      {params.then(({ agentId }) =>
        /^\d{1,9}$/.test(agentId) ? <AgentDashboard agentId={Number(agentId)} /> : <NotFound what="agent" value={agentId} />,
      )}
    </Suspense>
  );
}

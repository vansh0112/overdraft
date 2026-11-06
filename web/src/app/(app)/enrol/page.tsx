import type { Metadata } from "next";
import { Suspense } from "react";
import { EnrolFlow } from "@/components/enrol/EnrolFlow";
import { PageLoading } from "@/components/dashboard/states";

export const metadata: Metadata = {
  title: "Enrol an agent",
  description: "Sign your AI agent up for credit: its ERC-8004 ID as collateral, an income contract that repays loans, and a credit check.",
};

export default function EnrolPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <EnrolFlow />
    </Suspense>
  );
}

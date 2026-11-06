import type { Metadata } from "next";
import { OwnerHome } from "@/components/dashboard/OwnerHome";

export const metadata: Metadata = {
  title: "Owner dashboard",
  description: "Your agents' credit lines, loans, collateral and repayments, read live from Hedera, 0G and Arkiv.",
};

export default function DashboardPage() {
  return <OwnerHome />;
}

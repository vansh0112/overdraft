import type { Metadata } from "next";
import { Suspense } from "react";
import { OwnerView } from "@/components/dashboard/OwnerView";
import { NotFound, PageLoading } from "@/components/dashboard/states";

export const metadata: Metadata = {
  title: "Owner",
  description: "An owner's AI agents with their credit lines, collateral and credit decisions, read live from the chains.",
};

export default function OwnerPage({ params }: PageProps<"/owners/[address]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      {params.then(({ address }) =>
        /^(0x[0-9a-fA-F]{40}|0\.0\.\d{1,12})$/.test(address) ? <OwnerView owner={address} /> : <NotFound what="owner" value={address} />,
      )}
    </Suspense>
  );
}

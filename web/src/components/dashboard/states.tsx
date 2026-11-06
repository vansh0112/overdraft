import Link from "next/link";
import { Card, Skeleton } from "../console/ui";

export function PageLoading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6" aria-busy="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-6 h-12 w-72" />
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <Skeleton className="h-44" />
        </Card>
        <Card className="p-5">
          <Skeleton className="h-44" />
        </Card>
      </div>
    </div>
  );
}

export function NotFound({ what, value }: { what: "agent" | "owner"; value: string }) {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
      <Card className="p-6">
        <h1 className="display text-[30px]">
          &ldquo;{decodeURIComponent(value).slice(0, 64)}&rdquo; isn&apos;t {what === "agent" ? "an agent ID" : "a wallet address or Hedera account"}
        </h1>
        <p className="mt-3 text-[14px] text-muted">
          {what === "agent" ? "Agent IDs are numbers, like 140." : "Use a wallet address (0x followed by 40 characters) or a Hedera account (0.0.N)."}
        </p>
        <Link href="/agents" className="mt-5 inline-block text-[14px] text-fg underline underline-offset-4">
          See all agents
        </Link>
      </Card>
    </div>
  );
}

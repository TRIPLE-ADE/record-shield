"use client";

import type { EmergencySummary } from "@/lib/api/contracts/emergency";
import { SummaryGrid } from "./summary-grid";
import { InlineError } from "./inline-error";
import { SummarySkeleton } from "./summary-skeleton";

export function SummaryContent({
  summary,
  isPending,
  error,
}: {
  summary?: EmergencySummary;
  isPending: boolean;
  error: Error | null;
}) {
  return (
    <>
      {isPending ? <SummarySkeleton /> : null}
      {summary ? <SummaryGrid summary={summary} /> : null}
      {error ? <InlineError error={error} /> : null}
    </>
  );
}

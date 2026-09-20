"use client";

import { ApiError } from "@/lib/api/client";
import { ExchangeState } from "./exchange-state";

export function ExchangeError({ error }: { error: Error | null }) {
  const apiError = error instanceof ApiError ? error : undefined;
  return (
    <ExchangeState
      kind={apiError?.status === 403 ? "denied" : "unavailable"}
      title={apiError?.status === 403 ? "Access is outside this scope" : "Source unavailable"}
      description={apiError?.message ?? "The request could not be completed."}
      compact
    />
  );
}

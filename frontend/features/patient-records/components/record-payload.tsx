"use client";

import type { ClinicalRecord } from "@/lib/api/contracts/records";
import { formatLabel, formatValue } from "../utils/format";

export function RecordPayload({ payload }: { payload: ClinicalRecord["payload"] }) {
  if ("text" in payload) {
    return <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{payload.text}</p>;
  }
  const entries = Object.entries(payload as Record<string, unknown>).filter(
    ([, value]) => value !== null,
  );
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {formatLabel(key)}
          </dt>
          <dd className="mt-1 text-sm leading-6">{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

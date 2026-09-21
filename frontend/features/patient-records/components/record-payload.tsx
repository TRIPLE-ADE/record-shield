"use client";

import type { ClinicalRecord } from "@/lib/api/contracts/records";
import { formatLabel, formatValue } from "../utils/format";
import { NextOfKinDetails } from "./next-of-kin-details";

export function RecordPayload({ payload }: { payload: ClinicalRecord["payload"] }) {
  if ("text" in payload) {
    return <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{payload.text}</p>;
  }
  const entries = Object.entries(payload as Record<string, unknown>).filter(
    ([key, value]) => key !== "next_of_kin" && value !== null,
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
      {"next_of_kin" in payload ? (
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Next of kin
          </dt>
          <dd className="mt-2 text-sm leading-6">
            <NextOfKinDetails nextOfKin={payload.next_of_kin} />
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

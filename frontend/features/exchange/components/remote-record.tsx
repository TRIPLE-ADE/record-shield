"use client";

import { formatDomain, formatUtcDate } from "@/utils/formatters";
import type { ClinicalRecord } from "@/lib/api/contracts/records";
import { Separator } from "@/components/ui/separator";

export function RemoteRecord({ record }: { record: ClinicalRecord }) {
  const payload = record.payload;
  return (
    <div className="rounded-xl border border-border/70 bg-card/65 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{formatDomain(record.domain)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Observed {formatUtcDate(record.observed_at)}
          </p>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/7 px-2.5 py-1 text-[0.68rem] font-semibold text-primary">
          Read only
        </span>
      </div>
      <p className="mt-3 text-sm leading-6">
        {"text" in payload
          ? payload.text
          : Object.entries(payload as Record<string, unknown>)
              .map(([key, value]) => `${formatDomain(key)}: ${String(value)}`)
              .join(" · ")}
      </p>
      <Separator className="my-3" />
      <p className="text-xs text-muted-foreground">
        {record.source.local_patient_id} · source version {record.source.version} ·{" "}
        {record.source.record_id}
      </p>
    </div>
  );
}

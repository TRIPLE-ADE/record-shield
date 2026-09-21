"use client";

import { ClockIcon } from "@phosphor-icons/react";
import type { Domain } from "@/lib/api/contracts/records";
import { useLocalRecords } from "@/hooks/patient-records";
import { domainMeta } from "../data/domain-meta";
import { formatRecordDate } from "../utils/format";
import { RecordResults } from "./record-results";
import { RecordComposer } from "./record-composer";

export function RecordPanel({
  patientId,
  selectedDomain,
  selected,
  canWrite,
  encounterId,
}: {
  patientId: string;
  selectedDomain: Domain;
  selected: ReturnType<typeof useLocalRecords>;
  canWrite: boolean;
  encounterId?: string;
}) {
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Patient records
          </p>
          <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
            {domainMeta[selectedDomain].label}
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ClockIcon aria-hidden="true" className="size-4" />
          {selected.data?.retrieved_at
            ? `Retrieved ${formatRecordDate(selected.data.retrieved_at)}`
            : "Loading records"}
        </div>
      </div>

      <RecordResults selected={selected} canWrite={canWrite} />
      <RecordComposer
        patientId={patientId}
        selectedDomain={selectedDomain}
        canWrite={canWrite}
        encounterId={encounterId}
      />
    </div>
  );
}

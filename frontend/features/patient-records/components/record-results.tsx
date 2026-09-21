"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useLocalRecords } from "@/hooks/patient-records";
import { RecordCard } from "./record-card";
import { RecordErrorState } from "./record-error-state";
import { PatientRecordsState } from "./patient-records-state";

export function RecordResults({
  selected,
  canWrite,
}: {
  selected: ReturnType<typeof useLocalRecords>;
  canWrite: boolean;
}) {
  if (selected.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
    );
  }
  if (selected.error) return <RecordErrorState error={selected.error} />;
  if (!selected.data?.items.length) {
    return (
      <PatientRecordsState
        kind="empty"
        title="No records in this category"
        description="The hospital returned no records for this request. Information may be unavailable or protected."
      />
    );
  }
  return (
    <div className="space-y-3">
      {selected.data.items.map((record) => (
        <RecordCard key={`${record.id}:${record.version}`} record={record} canCorrect={canWrite} />
      ))}
      {selected.data.completeness_notice ? (
        <p className="px-1 text-xs leading-5 text-muted-foreground">
          {selected.data.completeness_notice}
        </p>
      ) : null}
    </div>
  );
}

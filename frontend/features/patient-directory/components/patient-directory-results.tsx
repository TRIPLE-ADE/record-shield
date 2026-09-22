"use client";

import { LoadingRows } from "@/components/loading-rows";

import type { usePatientDirectory } from "@/hooks/patients";
import type { PatientDirectoryEntry } from "@/lib/api/contracts/patients";
import { Button } from "@/components/ui/button";
import { PatientDirectoryCard } from "./patient-directory-card";

export function PatientDirectoryResults({
  query,
  updating,
  patients,
  submittedSearch,
  onClear,
}: {
  query: ReturnType<typeof usePatientDirectory>;
  updating: boolean;
  patients: PatientDirectoryEntry[];
  submittedSearch: string;
  onClear: () => void;
}) {
  return (
    <>
      {updating ? (
        <LoadingRows label="Loading patients…" />
      ) : query.error ? (
        <div role="alert" className="p-8">
          <p className="text-sm">We couldn’t load your patient list.</p>
          <Button variant="outline" className="mt-3" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      ) : patients.length ? (
        <div className="divide-y divide-border">
          {patients.map((patient) => (
            <PatientDirectoryCard key={patient.patient_id} patient={patient} />
          ))}
        </div>
      ) : (
        <div className="p-10 text-center">
          <h2 className="text-sm font-medium">
            {submittedSearch ? "No matching patients" : "No assigned patients"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {submittedSearch
              ? "Try a different name or local identifier."
              : "Patients will appear when they are available in your care assignment."}
          </p>
          {submittedSearch ? (
            <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
              Clear search
            </Button>
          ) : null}
        </div>
      )}
      {!updating && !query.error && query.hasNextPage ? (
        <div className="border-t border-border p-4 text-center">
          <Button
            variant="outline"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more patients"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

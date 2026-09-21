"use client";

import Link from "next/link";
import type { SessionContext } from "@/lib/api/contracts/auth";
import { usePatientDirectory } from "@/hooks/patients";
import { PatientDirectoryCard } from "@/features/patient-directory/components/patient-directory-card";
import { Button } from "@/components/ui/button";

export function AssignedPatients({ context }: { context: SessionContext }) {
  const query = usePatientDirectory({
    scopeKey: `${context.user.id}:${context.organization?.organization_id ?? "none"}`,
  });
  const patients = query.data?.pages.flatMap((page) => page.items).slice(0, 5) ?? [];
  return (
    <section
      aria-labelledby="assigned-heading"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 id="assigned-heading" className="font-semibold">
            Assigned patients
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Patients available in your current care assignment.
          </p>
        </div>
        <Link
          href="/workspace/patients"
          className="text-sm font-medium text-primary hover:underline"
        >
          View all patients
        </Link>
      </div>
      {query.isPending ? (
        <output className="p-5 text-sm text-muted-foreground">Loading your patients…</output>
      ) : query.error ? (
        <div role="alert" className="p-5">
          <p className="text-sm">Your patient list is unavailable.</p>
          <Button className="mt-3" variant="outline" size="sm" onClick={() => query.refetch()}>
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
        <p className="p-5 text-sm text-muted-foreground">
          No patients are assigned to you right now.
        </p>
      )}
    </section>
  );
}

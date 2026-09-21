"use client";

import { ArrowRightIcon, DatabaseIcon, LockKeyIcon, UserCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionContext } from "@/lib/api/contracts/auth";
import { useLocalRecords } from "@/hooks/patient-records";
import { getPatientSummary } from "@/utils/clinical-records";
import { formatRecordDate } from "@/features/patient-records/utils/format";

export function PatientContextCard({ context }: { context: SessionContext }) {
  const canRead = context.permissions_summary.includes("local_records.read_with_context");
  const purpose = context.role === "CLERK_HEALTH_ATTENDANT" ? "administration" : "treatment";
  const query = useLocalRecords(context.patient_id ?? "", "demographics", purpose, {
    enabled: Boolean(context.patient_id && canRead && context.organization),
  });
  const record = query.data?.items[0];
  const patient = getPatientSummary(record);

  if (!context.patient_id || !canRead) {
    return (
      <Card>
        <CardHeader className="px-5 py-5 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-lg">
            <LockKeyIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
            Current patient
          </CardTitle>
          <CardDescription>No patient is selected.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/4.5">
      <CardHeader className="border-b border-primary/12 px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserCircleIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
              My current patient
            </CardTitle>
            <CardDescription>Patient details for the current visit.</CardDescription>
          </div>
          <DatabaseIcon aria-hidden="true" className="size-5 text-primary/70" weight="duotone" />
        </div>
      </CardHeader>
      <CardContent className="px-5 py-5 sm:px-6">
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">Loading patient details…</p>
        ) : query.error ? (
          <p className="text-sm text-muted-foreground">
            Patient details are currently unavailable.
          </p>
        ) : (
          <>
            <p className="font-heading text-2xl font-semibold tracking-tight">
              {patient?.name ?? "Patient record"}
            </p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <PatientValue label="Local ID" value={record?.source.local_patient_id ?? "Pending"} />
              <PatientValue
                label="Date of birth"
                value={patient?.date_of_birth ?? "Not available"}
              />
              <PatientValue
                label="Last retrieved"
                value={record?.retrieved_at ? formatRecordDate(record.retrieved_at) : "Pending"}
              />
            </div>
            <Link
              href={`/workspace/patients/${context.patient_id}`}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Open patient records
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PatientValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

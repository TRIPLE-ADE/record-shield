"use client";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import type { SessionContext } from "@/lib/api/contracts/auth";
import { useSession } from "@/hooks/auth";
import { PatientRecordsContent } from "./components/patient-records-content";
import { PatientRecordsLoading, PatientRecordsState } from "./components";
import type { AuthorizedSessionContext, PatientRecordsPageProps } from "./types";

function hasRecordAccess(context: SessionContext | undefined): context is AuthorizedSessionContext {
  return Boolean(
    context?.organization &&
    context.permissions_summary.includes("local_records.read_with_context"),
  );
}

export default function PatientRecordsPage({ patientId }: PatientRecordsPageProps) {
  const session = useSession();

  if (session.isPending) return <PatientRecordsLoading />;
  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");

  const context = session.data;
  if (!hasRecordAccess(context)) {
    return (
      <PatientRecordsState
        kind="denied"
        title="Patient records are restricted"
        description="Your current role or care assignment does not allow you to view these records."
      />
    );
  }

  return <PatientRecordsContent patientId={patientId} context={context} />;
}

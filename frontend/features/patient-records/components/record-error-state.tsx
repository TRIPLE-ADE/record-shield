"use client";

import { ApiError } from "@/lib/api/client";
import { PatientRecordsState } from "./patient-records-state";

export function RecordErrorState({ error }: { error: Error | null }) {
  const apiError = error instanceof ApiError ? error : undefined;
  if (apiError?.status === 403) {
    return (
      <PatientRecordsState
        kind="denied"
        title="This domain is outside the current scope"
        description="Your role can continue with the domains assigned to this context."
      />
    );
  }
  if (apiError?.status === 404) {
    return (
      <PatientRecordsState
        kind="empty"
        title="Patient record not found"
        description="The current source could not find this patient in its local register."
      />
    );
  }
  return (
    <PatientRecordsState
      kind="unavailable"
      title="Source unavailable"
      description={apiError?.message ?? "The record source could not be reached. Try again."}
    />
  );
}

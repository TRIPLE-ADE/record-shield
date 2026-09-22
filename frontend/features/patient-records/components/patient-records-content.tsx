"use client";

import { ApiError } from "@/lib/api/client";
import { useCareSelection } from "@/hooks/care-selection";
import { usePatientContext } from "@/hooks/patients";
import { useLocalRecords, type RecordPurpose } from "@/hooks/patient-records";
import {
  canActivateEmergency,
  canWriteLocalDomain,
  isTreatingPractitioner,
} from "@/utils/authorization";
import { getPatientSummary } from "@/utils/clinical-records";
import { PatientRecordsState } from "./patient-records-state";
import { PatientRecordsWorkspace } from "./patient-records-workspace";
import type { AuthorizedSessionContext } from "../types";

export function PatientRecordsContent({
  patientId,
  context,
}: {
  patientId: string;
  context: AuthorizedSessionContext;
}) {
  const purpose: RecordPurpose =
    context.role === "CLERK_HEALTH_ATTENDANT" ? "administration" : "treatment";
  const patientContext = usePatientContext(patientId);
  const encounters = patientContext.error ? [] : (patientContext.data?.encounters ?? []);
  const care = useCareSelection(encounters);
  const selectedDomain = care.selection.domain;
  const overview = useLocalRecords(patientId, "demographics", purpose);
  const selected = useLocalRecords(patientId, selectedDomain, purpose);
  const patientRecord = overview.data?.items.find((record) => record.domain === "demographics");
  const source = selected.data?.source ?? overview.data?.source;
  const canWrite =
    canWriteLocalDomain(context, selectedDomain) && !patientContext.error && !selected.error;

  if (overview.error instanceof ApiError && overview.error.status === 404) {
    return (
      <PatientRecordsState
        kind="denied"
        title="Patient record unavailable"
        description="This record is unavailable or you do not have permission to view it."
      />
    );
  }

  return (
    <PatientRecordsWorkspace
      patientId={patientId}
      context={context}
      patient={getPatientSummary(patientRecord)}
      localPatientId={patientRecord?.source.local_patient_id}
      encounterId={care.encounter?.id}
      sourceName={source?.name}
      canExchange={
        isTreatingPractitioner(context.role) &&
        !patientContext.error &&
        Boolean(patientContext.data?.can_request_records)
      }
      canEmergency={
        canActivateEmergency(context) &&
        !patientContext.error &&
        Boolean(patientContext.data?.can_activate_emergency)
      }
      encounters={encounters}
      patientContext={patientContext}
      care={care}
      selectedDomain={selectedDomain}
      selected={selected}
      canWrite={canWrite}
    />
  );
}

"use client";

import type { Domain } from "@/lib/api/contracts/records";
import { NursingNoteComposer } from "./nursing-note-composer";
import { VitalComposer } from "./vital-composer";
import { PatientRecordsState } from "./patient-records-state";

export function RecordComposer({
  patientId,
  selectedDomain,
  canWrite,
  encounterId,
}: {
  patientId: string;
  selectedDomain: Domain;
  canWrite: boolean;
  encounterId?: string;
}) {
  if (canWrite && encounterId && selectedDomain === "nursing_notes") {
    return <NursingNoteComposer patientId={patientId} encounterId={encounterId} />;
  }
  if (canWrite && encounterId && selectedDomain === "vitals") {
    return <VitalComposer patientId={patientId} encounterId={encounterId} />;
  }
  if (
    canWrite &&
    (selectedDomain === "nursing_notes" || selectedDomain === "vitals") &&
    !encounterId
  ) {
    return (
      <PatientRecordsState
        kind="unavailable"
        title="An open encounter is required to add a record"
        description="This patient has no available visit for a new record."
      />
    );
  }
  return null;
}

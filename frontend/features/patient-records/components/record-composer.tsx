"use client";

import type { CareEditingState } from "@/hooks/care-selection";
import type { Domain } from "@/lib/api/contracts/records";
import { NursingNoteComposer } from "./nursing-note-composer";
import { VitalComposer } from "./vital-composer";
import { PatientRecordsState } from "./patient-records-state";

export function RecordComposer({
  patientId,
  selectedDomain,
  canWrite,
  encounterId,
  onEditingChange,
}: {
  patientId: string;
  selectedDomain: Domain;
  canWrite: boolean;
  encounterId?: string;
  onEditingChange?: (state: CareEditingState) => void;
}) {
  if (canWrite && encounterId && selectedDomain === "nursing_notes") {
    return (
      <NursingNoteComposer
        patientId={patientId}
        encounterId={encounterId}
        onEditingChange={onEditingChange}
      />
    );
  }
  if (canWrite && encounterId && selectedDomain === "vitals") {
    return (
      <VitalComposer
        patientId={patientId}
        encounterId={encounterId}
        onEditingChange={onEditingChange}
      />
    );
  }
  if (
    canWrite &&
    (selectedDomain === "nursing_notes" || selectedDomain === "vitals") &&
    !encounterId
  ) {
    return (
      <PatientRecordsState
        kind="unavailable"
        title="An open visit is required to add a record"
        description="This patient has no available visit for a new record."
      />
    );
  }
  return null;
}

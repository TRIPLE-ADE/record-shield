"use client";

import type { Encounter, Domain } from "@/lib/api/contracts/records";
import { useCareSelection } from "@/hooks/care-selection";
import { usePatientContext } from "@/hooks/patients";
import { useLocalRecords } from "@/hooks/patient-records";
import { CareVisitPanel } from "./care-visit-panel";
import { DiscardDraftDialog } from "./discard-draft-dialog";
import { PatientOverview } from "./patient-overview";
import { RecordDomainNavigation } from "./record-domain-navigation";
import { RecordPanel } from "./record-panel";
import type { PatientSummary } from "@/utils/clinical-records";
import type { AuthorizedSessionContext } from "../types";

type PatientRecordsWorkspaceProps = {
  patientId: string;
  context: AuthorizedSessionContext;
  patient?: PatientSummary;
  localPatientId?: string;
  encounterId?: string;
  sourceName?: string;
  canExchange: boolean;
  canEmergency: boolean;
  encounters: Encounter[];
  patientContext: ReturnType<typeof usePatientContext>;
  care: ReturnType<typeof useCareSelection>;
  selectedDomain: Domain;
  selected: ReturnType<typeof useLocalRecords>;
  canWrite: boolean;
};

export function PatientRecordsWorkspace({
  patientId,
  context,
  patient,
  localPatientId,
  encounterId,
  sourceName,
  canExchange,
  canEmergency,
  encounters,
  patientContext,
  care,
  selectedDomain,
  selected,
  canWrite,
}: PatientRecordsWorkspaceProps) {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-10 lg:py-10"
    >
      <PatientOverview
        patientId={patientId}
        patient={patient}
        localPatientId={localPatientId}
        encounterId={encounterId}
        context={context}
        sourceName={sourceName}
        canExchange={canExchange}
        canEmergency={canEmergency}
      />
      <CareVisitPanel
        encounters={encounters}
        selectedId={care.selection.encounterId}
        loading={patientContext.isPending}
        error={Boolean(patientContext.error)}
        onRetry={() => patientContext.refetch()}
        onSelect={(id) => care.requestSelection({ encounterId: id })}
        saving={care.editing.saving}
        connected={context.organization.mode !== "LITE"}
      />
      <DiscardDraftDialog
        open={care.discardOpen}
        onKeep={care.keepEditing}
        onDiscard={care.discard}
      />
      <section className="mt-7 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <RecordDomainNavigation
          selectedDomain={selectedDomain}
          disabled={care.editing.saving}
          onSelect={(domain) => care.requestSelection({ domain })}
        />
        <RecordPanel
          patientId={patientId}
          selectedDomain={selectedDomain}
          selected={selected}
          canWrite={canWrite}
          encounterId={encounterId}
          onEditingChange={care.setEditing}
        />
      </section>
    </main>
  );
}

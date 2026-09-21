"use client";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import type { SessionContext } from "@/lib/api/contracts/auth";
import {
  canActivateEmergency,
  canWriteLocalDomain,
  isTreatingPractitioner,
} from "@/utils/authorization";
import { getPatientSummary } from "@/utils/clinical-records";
import { useCareSelection } from "@/hooks/care-selection";
import { CareVisitPanel } from "./components/care-visit-panel";
import { DiscardDraftDialog } from "./components/discard-draft-dialog";
import { usePatientContext } from "@/hooks/patients";
import { useSession } from "@/hooks/auth";
import { useLocalRecords, type RecordPurpose } from "@/hooks/patient-records";
import {
  PatientOverview,
  PatientRecordsLoading,
  PatientRecordsState,
  RecordDomainNavigation,
  RecordPanel,
} from "./components";
import type { PatientRecordsPageProps } from "./types";

export default function PatientRecordsPage({ patientId }: PatientRecordsPageProps) {
  const session = useSession();
  const context = session.data;
  const purpose: RecordPurpose =
    context?.role === "CLERK_HEALTH_ATTENDANT" ? "administration" : "treatment";
  const queryEnabled = Boolean(
    context?.organization &&
    context.permissions_summary.includes("local_records.read_with_context"),
  );
  const patientContext = usePatientContext(patientId, queryEnabled);
  const encounters = patientContext.error ? [] : (patientContext.data?.encounters ?? []);
  const care = useCareSelection(encounters);
  const selectedDomain = care.selection.domain;
  const overview = useLocalRecords(patientId, "demographics", purpose, { enabled: queryEnabled });
  const selected = useLocalRecords(patientId, selectedDomain, purpose, { enabled: queryEnabled });
  const patientRecord = overview.data?.items.find((record) => record.domain === "demographics");
  const patient = getPatientSummary(patientRecord);
  const localPatientId = patientRecord?.source.local_patient_id;
  const encounterId = care.encounter?.id;
  const canWrite =
    canWriteLocalDomain(context, selectedDomain) && !patientContext.error && !selected.error;
  const source = selected.data?.source ?? overview.data?.source;

  if (session.isPending) return <PatientRecordsLoading />;
  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  if (!context || !context.organization || !queryEnabled) {
    return (
      <PatientRecordsState
        kind="denied"
        title="Patient records are restricted"
        description="Your current role or care assignment does not allow you to view these records."
      />
    );
  }

  if (overview.error instanceof ApiError && overview.error.status === 404) {
    return (
      <PatientRecordsState
        kind="denied"
        title="Patient record unavailable"
        description="This record is unavailable or you do not have permission to view it."
      />
    );
  }

  const authenticatedContext = context as SessionContext & {
    organization: NonNullable<SessionContext["organization"]>;
  };

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
        context={authenticatedContext}
        sourceName={source?.name}
        sourceMode={source?.mode}
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

"use client";

import { redirect } from "next/navigation";
import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import type { SessionContext } from "@/lib/api/contracts/auth";
import type { Domain } from "@/lib/api/contracts/records";
import {
  canActivateEmergency,
  canWriteLocalDomain,
  isTreatingPractitioner,
} from "@/utils/authorization";
import { getPatientSummary } from "@/utils/clinical-records";
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
  const [selectedDomain, setSelectedDomain] = useState<Domain>("demographics");
  const context = session.data;
  const purpose: RecordPurpose =
    context?.role === "CLERK_HEALTH_ATTENDANT" ? "administration" : "treatment";
  const queryEnabled = Boolean(
    context?.organization &&
    context.permissions_summary.includes("local_records.read_with_context"),
  );
  const overview = useLocalRecords(patientId, "demographics", purpose, { enabled: queryEnabled });
  const selected = useLocalRecords(patientId, selectedDomain, purpose, { enabled: queryEnabled });
  const patientRecord = overview.data?.items.find((record) => record.domain === "demographics");
  const patient = getPatientSummary(patientRecord);
  const localPatientId = patientRecord?.source.local_patient_id;
  const encounterId = overview.data?.items[0]?.encounter_id;
  const canWrite = canWriteLocalDomain(context, selectedDomain);
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
        canExchange={isTreatingPractitioner(context.role) && context.patient_id === patientId}
        canEmergency={canActivateEmergency(context) && context.patient_id === patientId}
      />
      <section className="mt-7 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <RecordDomainNavigation selectedDomain={selectedDomain} onSelect={setSelectedDomain} />
        <RecordPanel
          patientId={patientId}
          selectedDomain={selectedDomain}
          selected={selected}
          canWrite={canWrite}
          encounterId={encounterId}
        />
      </section>
    </main>
  );
}

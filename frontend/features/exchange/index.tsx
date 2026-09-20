"use client";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import type { ClinicalRecord } from "@/lib/api/contracts/records";
import { useSession } from "@/features/auth/use-session";
import { useLocalRecords } from "@/features/patient-records/api";
import { ExchangeLoading, ExchangeState, ExchangeWorkspace } from "./components";

export default function ExchangePage({ patientId }: { patientId: string }) {
  const session = useSession();
  const context = session.data;
  const localRecords = useLocalRecords(patientId, "demographics", "treatment", {
    enabled: Boolean(context?.organization && context.patient_id === patientId),
  });
  const receivingEncounterId = localRecords.data?.items[0]?.encounter_id ?? "";
  const patientName = getPatientName(localRecords.data?.items[0]);

  if (session.isPending || localRecords.isPending) return <ExchangeLoading />;
  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  if (!context || context.patient_id !== patientId || !context.organization) {
    return (
      <ExchangeState
        kind="denied"
        title="Exchange context unavailable"
        description="The current session is not linked to this patient."
      />
    );
  }
  if (!isExchangePractitioner(context.role)) {
    return (
      <ExchangeState
        kind="denied"
        title="Exchange is limited to treating practitioners"
        description="This role can continue with local records in its current context."
      />
    );
  }

  return (
    <ExchangeWorkspace
      patientId={patientId}
      patientName={patientName}
      organizationName={context.organization.name}
      receivingEncounterId={receivingEncounterId}
    />
  );
}

function isExchangePractitioner(role: string | null) {
  return ["ATTENDING_DOCTOR", "VISITING_DOCTOR", "EMERGENCY_DOCTOR", "NURSE_MIDWIFE"].includes(
    role ?? "",
  );
}

function getPatientName(record: ClinicalRecord | undefined) {
  const payload = record?.payload;
  return payload && "name" in payload ? payload.name : undefined;
}

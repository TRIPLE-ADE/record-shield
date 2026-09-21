"use client";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { getPatientName } from "@/utils/clinical-records";
import { isTreatingPractitioner } from "@/utils/authorization";
import { useSession } from "@/hooks/auth";
import { useLocalRecords } from "@/hooks/patient-records";
import { ExchangeLoading, ExchangeState, ExchangeWorkspace } from "./components";
import type { ExchangePageProps } from "./types";

export default function ExchangePage({ patientId }: ExchangePageProps) {
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
        title="Record sharing unavailable"
        description="This patient is not available for record sharing through your current account."
      />
    );
  }
  if (!isTreatingPractitioner(context.role)) {
    return (
      <ExchangeState
        kind="denied"
        title="Exchange is limited to treating practitioners"
        description="You can continue viewing the local records available to your role."
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

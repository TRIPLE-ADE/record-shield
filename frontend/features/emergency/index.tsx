"use client";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { getPatientName } from "@/utils/clinical-records";
import { useSession } from "@/hooks/auth";
import { useDiscoverSources } from "@/hooks/exchange";
import { useLocalRecords } from "@/hooks/patient-records";
import { EmergencyDenied, EmergencyLoading, EmergencyWorkspace } from "./components";
import { canActivateEmergency } from "@/utils/authorization";
import type { EmergencyPageProps } from "./types";

export default function EmergencyPage({ patientId }: EmergencyPageProps) {
  const session = useSession();
  const context = session.data;
  const records = useLocalRecords(patientId, "demographics", "treatment", {
    enabled: Boolean(context?.organization && context.patient_id === patientId),
  });
  const encounterId = records.data?.items[0]?.encounter_id ?? "";
  const sources = useDiscoverSources(
    patientId,
    encounterId,
    Boolean(encounterId),
    "emergency_treatment",
  );
  const patientName = getPatientName(records.data?.items[0]);

  if (session.isPending || records.isPending) return <EmergencyLoading />;
  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  if (!context || context.patient_id !== patientId || !context.organization) {
    return <EmergencyDenied description="The current session is not linked to this patient." />;
  }
  if (!canActivateEmergency(context)) {
    return <EmergencyDenied description="This work context cannot activate emergency access." />;
  }

  const authenticatedContext = context as typeof context & {
    organization: NonNullable<typeof context.organization>;
  };

  return (
    <EmergencyWorkspace
      patientId={patientId}
      patientName={patientName}
      organizationName={context.organization.name}
      encounterId={encounterId}
      sessionContext={authenticatedContext}
      sources={sources.data?.items ?? []}
    />
  );
}

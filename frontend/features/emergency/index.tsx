"use client";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/hooks/auth";
import { usePatientContext } from "@/hooks/patients";
import { EmergencyDenied, EmergencyLoading, EmergencyWorkspace } from "./components";
import { canActivateEmergency } from "@/utils/authorization";
import type { EmergencyPageProps } from "./types";

export default function EmergencyPage({ patientId }: EmergencyPageProps) {
  const session = useSession();
  const context = session.data;
  const patient = usePatientContext(patientId, Boolean(context?.organization));
  if (session.isPending) return <EmergencyLoading />;
  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  if (!context || !context.organization) {
    return (
      <EmergencyDenied description="This patient is not available for record sharing through your current account." />
    );
  }
  if (!canActivateEmergency(context)) {
    return (
      <EmergencyDenied description="Your current role or shift does not allow emergency access." />
    );
  }

  if (patient.isPending) return <EmergencyLoading />;
  if (patient.error || !patient.data?.can_activate_emergency)
    return (
      <EmergencyDenied description="An open emergency visit and permission to care for this patient are required." />
    );

  const authenticatedContext = context as typeof context & {
    organization: NonNullable<typeof context.organization>;
  };

  return (
    <EmergencyWorkspace
      patientId={patientId}
      patientName={patient.data.patient.name}
      organizationName={context.organization.name}
      encounters={patient.data.encounters.filter((item) => item.type === "EMERGENCY")}
      sessionContext={authenticatedContext}
    />
  );
}

"use client";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { isTreatingPractitioner } from "@/utils/authorization";
import { useSession } from "@/hooks/auth";
import { usePatientContext } from "@/hooks/patients";
import { ExchangeLoading, ExchangeState, ExchangeWorkspace } from "./components";
import type { ExchangePageProps } from "./types";

export default function ExchangePage({ patientId }: ExchangePageProps) {
  const session = useSession();
  const context = session.data;
  const patient = usePatientContext(patientId, Boolean(context?.organization));

  if (session.isPending) return <ExchangeLoading />;
  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  if (!context || !context.organization) {
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

  if (patient.isPending) return <ExchangeLoading />;
  if (patient.error || !patient.data?.can_request_records)
    return (
      <ExchangeState
        kind="denied"
        title="Record sharing unavailable"
        description="An active visit and permission to care for this patient are required. Return to the patient list or ask your care team for help."
      />
    );

  return (
    <ExchangeWorkspace
      patientId={patientId}
      patientName={patient.data.patient.name}
      organizationName={context.organization.name}
      encounters={patient.data.encounters}
    />
  );
}

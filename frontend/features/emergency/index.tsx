"use client";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import type { ClinicalRecord } from "@/lib/api/contracts/records";
import { useSession } from "@/features/auth/use-session";
import { useDiscoverSources } from "@/features/exchange/api";
import { useLocalRecords } from "@/features/patient-records/api";
import { EmergencyWorkspace } from "./components";

export default function EmergencyPage({ patientId }: { patientId: string }) {
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
  if (
    context.role !== "EMERGENCY_DOCTOR" ||
    !context.permissions_summary.includes("emergency.activate_with_context") ||
    !context.shift?.active
  ) {
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

function getPatientName(record: ClinicalRecord | undefined) {
  const payload = record?.payload;
  return payload && "name" in payload ? payload.name : undefined;
}

function EmergencyLoading() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="space-y-5">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </main>
  );
}

function EmergencyDenied({ description }: { description: string }) {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-heading text-xl font-semibold">Emergency access unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </main>
  );
}

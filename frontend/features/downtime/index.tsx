"use client";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { apiMode } from "@/lib/api/bootstrap";
import { useSession } from "@/hooks/auth";
import { useDemoStatus } from "@/hooks/downtime";
import {
  DemoControls,
  DependencyStatus,
  DowntimeState,
  ReconciliationForm,
  RehearsalPanel,
} from "./components";

export default function DowntimePage() {
  const session = useSession();
  const isDemo = apiMode === "mock" && process.env.NODE_ENV !== "production";
  const demoStatus = useDemoStatus({ enabled: isDemo && session.data?.role === "SECURITY_ADMIN" });

  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  if (session.isPending) {
    return (
      <DowntimeState
        title="Loading resilience controls"
        description="Checking your account permissions."
        kind="unavailable"
      />
    );
  }
  if (!session.data || session.data.role !== "SECURITY_ADMIN" || !session.data.organization) {
    return (
      <DowntimeState
        title="Downtime controls are restricted"
        description="Only a local security administrator can reconcile paper forms or run the demo rehearsal."
      />
    );
  }

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10"
    >
      <header className="flex flex-col justify-between gap-4 border-b border-border/70 pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Resilience
          </p>
          <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Downtime recovery
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Reconcile paper records after an interruption and track recovery readiness.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">{session.data.organization.name}</p>
      </header>

      <DependencyStatus demoStatus={demoStatus.data} />
      <div className="max-w-3xl">
        <ReconciliationForm patientId={session.data.patient_id} />
      </div>
      {isDemo && demoStatus.data ? (
        <details className="rounded-xl border border-dashed border-border p-5">
          <summary className="cursor-pointer text-sm font-medium">Demo rehearsal tools</summary>
          <div className="mt-5 space-y-5">
            <DemoControls status={demoStatus.data} />
            <RehearsalPanel />
          </div>
        </details>
      ) : null}
      {demoStatus.error && isDemo ? (
        <p className="text-xs text-muted-foreground">
          Demo controls are unavailable; the protected workflow remains usable.
        </p>
      ) : null}
    </main>
  );
}

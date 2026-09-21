"use client";

import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, SirenIcon } from "@phosphor-icons/react";
import type { PatientSummary } from "@/utils/clinical-records";
import type { SessionContext } from "@/lib/api/contracts/auth";

export function PatientOverview({
  patientId,
  patient,
  localPatientId,
  encounterId,
  context,
  sourceName,
  canExchange,
  canEmergency,
}: {
  patientId: string;
  patient?: PatientSummary;
  localPatientId?: string;
  encounterId?: string;
  context: SessionContext & { organization: NonNullable<SessionContext["organization"]> };
  sourceName?: string;
  sourceMode?: "LITE" | "MOCK_EMR";
  canExchange: boolean;
  canEmergency: boolean;
}) {
  return (
    <header className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <Link
          href="/workspace/patients"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          All patients
        </Link>
        <span className="text-xs text-muted-foreground">
          Local records · {sourceName ?? context.organization.name}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-5 p-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Patient record</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            {patient?.name ?? "Patient record"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {localPatientId ?? "Local identifier pending"} · {context.organization.name}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>Born {patient?.date_of_birth ?? "Not available"}</span>
            <span>{patient?.gender ?? "Gender unavailable"}</span>
            <span>{encounterId ? "Current visit" : "No open visit"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canExchange ? (
            <Link
              href={`/workspace/patients/${patientId}/exchange`}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Request records
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
          {canEmergency ? (
            <Link
              href={`/workspace/patients/${patientId}/emergency`}
              className="inline-flex items-center gap-2 rounded-lg border border-emergency/25 px-4 py-2.5 text-sm font-medium text-emergency hover:bg-emergency/5"
            >
              <SirenIcon aria-hidden="true" className="size-4" />
              Open emergency summary
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  DatabaseIcon,
  SirenIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import type { PatientSummary } from "@/utils/clinical-records";
import type { SessionContext } from "@/lib/api/contracts/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRole } from "../utils/format";
import { PatientMeta } from "./patient-meta";

export function PatientOverview({
  patientId,
  patient,
  localPatientId,
  encounterId,
  context,
  sourceName,
  sourceMode,
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
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/workspace"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Workspace overview
        </Link>
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/7 px-3 py-1.5 text-xs font-medium text-primary">
          <ShieldCheckIcon aria-hidden="true" className="size-3.5" weight="duotone" />
          {context.organization.name}
        </span>
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="overflow-hidden border-primary/20 bg-primary/4.5">
          <CardContent className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  <ShieldCheckIcon aria-hidden="true" className="size-6" weight="duotone" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Patient workspace
                  </p>
                  <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                    {patient?.name ?? "Patient record"}
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {localPatientId ?? "Local identifier pending"} · {context.organization.name}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-right">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Access
                </p>
                <p className="mt-1 text-sm font-medium">{formatRole(context.role)}</p>
              </div>
            </div>
            <div className="mt-7 grid gap-4 border-t border-primary/12 pt-5 sm:grid-cols-3">
              <PatientMeta
                label="Date of birth"
                value={patient?.date_of_birth ?? "Not available"}
              />
              <PatientMeta label="Gender" value={patient?.gender ?? "Not available"} />
              <PatientMeta
                label="Encounter"
                value={encounterId ? "Current encounter" : "No open encounter"}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-5 py-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseIcon aria-hidden="true" className="size-4 text-primary" weight="duotone" />
              Record source
            </CardTitle>
            <CardDescription>Every result carries its source and version.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Organization</span>
              <span className="font-medium">{sourceName ?? context.organization.name}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Mode</span>
              <span className="font-medium">
                {sourceMode === "LITE" ? "Lite EMR" : "Existing EMR"}
              </span>
            </div>
            <div className="flex items-center gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
              <CheckCircleIcon
                aria-hidden="true"
                className="size-4 text-success"
                weight="duotone"
              />
              Context checked for this request
            </div>
            {canExchange ? (
              <Link
                href={`/workspace/patients/${patientId}/exchange`}
                className="inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-primary hover:underline"
              >
                Request source access
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
            {canEmergency ? (
              <Link
                href={`/workspace/patients/${patientId}/emergency`}
                className="inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-emergency hover:underline"
              >
                Open emergency summary
                <SirenIcon aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

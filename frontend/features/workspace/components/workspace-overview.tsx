"use client";

import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  ClockCountdownIcon,
  DatabaseIcon,
  LockKeyIcon,
  PulseIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRole, formatTime, humanizePermission } from "../utils/format";
import type { WorkspaceOverviewProps } from "../types";
import { ContextItem } from "./context-item";
import { NextStepCard } from "./next-step-card";
import { PatientContextCard } from "./patient-context-card";

export function WorkspaceOverview({ context, isFetching, onRefresh }: WorkspaceOverviewProps) {
  const firstName = context.user.username.split(".")[0];

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10"
    >
      <section className="flex flex-col justify-between gap-5 border-b border-border/70 pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Overview</p>
          <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Good to see you, {firstName}.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Your protected workspace is ready. The context below came from the current session and
            will be rechecked before protected records are released.
          </p>
        </div>
        <Button variant="outline" onClick={onRefresh} disabled={isFetching}>
          <ArrowClockwiseIcon aria-hidden="true" className={isFetching ? "animate-spin" : ""} />
          Refresh context
        </Button>
      </section>

      <section className="grid gap-5 py-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
        <Card className="border-primary/20 bg-primary/4.5 shadow-sm">
          <CardHeader className="border-b border-primary/12 px-5 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheckIcon
                    aria-hidden="true"
                    className="size-5 text-primary"
                    weight="duotone"
                  />
                  Current access context
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Informational context from the server. It is never a permission by itself.
                </CardDescription>
              </div>
              <Badge className="bg-success/12 text-success">Verified</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
            <ContextItem
              label="Identity"
              value={context.user.username}
              detail={context.user.kind}
            />
            <ContextItem
              label="Role"
              value={formatRole(context.role)}
              detail={context.membership_id ? "Active membership" : "No membership"}
            />
            <ContextItem
              label="Hospital"
              value={context.organization?.name ?? "Patient portal"}
              detail={
                context.organization?.mode === "LITE" ? "RecordShield Lite EMR" : "Existing EMR"
              }
            />
            <ContextItem
              label="Shift"
              value={context.shift?.active ? "Active now" : "No active shift"}
              detail={
                context.shift
                  ? `${formatTime(context.shift.starts_at)} – ${formatTime(context.shift.ends_at)}`
                  : "No duty window returned"
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-5 py-5 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <LockKeyIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
              Session guardrails
            </CardTitle>
            <CardDescription>What this session is prepared to request.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5 sm:px-6">
            {context.permissions_summary.length ? (
              context.permissions_summary.map((permission) => (
                <div key={permission} className="flex items-center gap-2 text-sm">
                  <CheckCircleIcon
                    aria-hidden="true"
                    className="size-4 text-success"
                    weight="duotone"
                  />
                  <span>{humanizePermission(permission)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No staff permissions are attached to this session.
              </p>
            )}
            <div className="mt-4 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
              A permission summary describes possible actions. Each patient decision is evaluated
              again at the protected request.
            </div>
          </CardContent>
        </Card>
      </section>

      <PatientContextCard context={context} />

      <section className="grid gap-4 sm:grid-cols-3">
        <NextStepCard
          icon={<DatabaseIcon aria-hidden="true" />}
          eyebrow="Current encounter"
          title="Local records"
          copy="Open the patient context returned for this session and review local records."
          href={context.patient_id ? `/workspace/patients/${context.patient_id}` : undefined}
        />
        <NextStepCard
          icon={<PulseIcon aria-hidden="true" />}
          eyebrow="Protected later"
          title="Exchange and consent"
          copy="Cross-hospital discovery stays behind explicit purpose, scope, and patient approval."
        />
        <NextStepCard
          icon={<ClockCountdownIcon aria-hidden="true" />}
          eyebrow="Evidence"
          title="Session timing"
          copy="Idle and absolute expiry are server decisions; this view never extends the session."
        />
      </section>
    </main>
  );
}

"use client";

import { ShieldCheckIcon, SirenIcon } from "@phosphor-icons/react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { emergencyReasonOptions } from "../data/options";
import type { EmergencyActivateFormValues } from "../schemas";
import type { EmergencyActivationProps } from "../types";
import { EmergencyPageFrame } from "./emergency-page-frame";
import { ContextValue } from "./context-value";

export function ActivationView({
  patientId,
  patientName,
  organizationName,
  encounterId,
  sources,
  sessionContext,
  form,
  necessityConfirmed,
  isSubmitting,
  onSubmit,
}: {
  patientId: string;
  patientName?: string;
  organizationName: string;
  encounterId: string;
  sources: EmergencyActivationProps["sources"];
  sessionContext: EmergencyActivationProps["sessionContext"];
  form: ReturnType<typeof useForm<EmergencyActivateFormValues>>;
  necessityConfirmed: boolean;
  isSubmitting: boolean;
  onSubmit: (values: EmergencyActivateFormValues) => void;
}) {
  return (
    <EmergencyPageFrame patientId={patientId}>
      <div className="max-w-3xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emergency">
            Emergency access
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Open an emergency patient summary
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Use the smallest safe view for the immediate decision. This session is visible to the
            patient and security team, expires after 15 minutes, and requires a clinical review.
          </p>
        </div>

        <Card className="overflow-hidden border-emergency/30 bg-emergency/3">
          <div className="h-1 bg-emergency" />
          <CardHeader className="px-5 py-5 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <SirenIcon aria-hidden="true" className="size-5 text-emergency" weight="duotone" />
              Confirm the patient and hospital
            </CardTitle>
            <CardDescription>
              Check the patient, hospital, and current visit before continuing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-6 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <ContextValue label="Patient" value={patientName ?? "Patient record"} />
              <ContextValue label="Receiving facility" value={organizationName} />
              <ContextValue
                label="Visit"
                value={encounterId ? "Open emergency visit" : "Unavailable"}
              />
            </div>

            <form
              className="space-y-5 border-t border-emergency/15 pt-5"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <div className="space-y-2">
                <Label htmlFor="emergency-source">Source facility</Label>
                <select
                  id="emergency-source"
                  {...form.register("source_org_id")}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  <option value="">Choose a hospital</option>
                  {sources.map((source) => (
                    <option
                      key={source.organization.organization_id}
                      value={source.organization.organization_id}
                    >
                      {source.organization.name}
                    </option>
                  ))}
                </select>
                {sources.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No linked source is available for this encounter.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="emergency-reason">Reason for immediate access</Label>
                <select
                  id="emergency-reason"
                  {...form.register("reason_code")}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  {emergencyReasonOptions.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emergency/20 bg-emergency/5 p-4">
                <input
                  type="checkbox"
                  {...form.register("necessity_confirmed")}
                  className="mt-1 size-4 accent-emergency"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">I confirm this is necessary now</span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    I am acting within my active shift and will use only what is needed for
                    immediate treatment.
                  </span>
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emergency/15 pt-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheckIcon
                    aria-hidden="true"
                    className="size-4 text-success"
                    weight="duotone"
                  />
                  {sessionContext.user.username} · {sessionContext.role?.replaceAll("_", " ")}
                </p>
                <Button
                  type="submit"
                  disabled={!form.formState.isValid || !necessityConfirmed || isSubmitting}
                >
                  <SirenIcon aria-hidden="true" />
                  {isSubmitting ? "Activating…" : "Activate emergency summary"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </EmergencyPageFrame>
  );
}

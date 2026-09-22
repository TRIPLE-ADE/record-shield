"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowClockwiseIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import type { DowntimeReconciliationCreate } from "@/lib/api/contracts/downtime";
import { useCreateDowntimeReconciliation } from "@/hooks/downtime";
import { toDateTimeLocal, formDateToUtc } from "../utils/format";
import { ReconciliationResult } from "./reconciliation-result";

const reconciliationFormSchema = z
  .object({
    form_serial: z.string().trim().min(1, "Enter the paper form serial.").max(80),
    patient_id: z.uuid("Enter a canonical patient ID."),
    encounter_id: z.uuid("Enter the encounter ID."),
    occurred_at: z.string().min(1, "Enter when the paper form was created."),
    transcribed_at: z.string().min(1, "Enter when the form was transcribed."),
    transcriber_id: z.uuid("Enter the transcriber ID."),
    clinical_reviewer_id: z.uuid("Enter the clinical reviewer ID."),
    record_id: z.uuid("Enter a local record ID."),
    record_version: z.number().int().min(1, "Version must be at least 1."),
    outcome: z.enum(["RECONCILED", "DISCREPANCY_REQUIRES_REVIEW"]),
    notes: z.string().max(400, "Keep the note under 400 characters.").optional(),
  })
  .superRefine((values, context) => {
    const occurred = new Date(values.occurred_at).getTime();
    const transcribed = new Date(values.transcribed_at).getTime();
    if (!Number.isFinite(occurred) || !Number.isFinite(transcribed)) return;
    if (occurred > transcribed) {
      context.addIssue({
        code: "custom",
        path: ["transcribed_at"],
        message: "Transcription cannot be earlier than the paper occurrence.",
      });
    }
    if (transcribed > Date.now()) {
      context.addIssue({
        code: "custom",
        path: ["transcribed_at"],
        message: "Transcription cannot be in the future.",
      });
    }
  });

type ReconciliationFormValues = z.infer<typeof reconciliationFormSchema>;

function fieldError(
  errors: Partial<Record<keyof ReconciliationFormValues, { message?: string }>>,
  field: keyof ReconciliationFormValues,
) {
  return errors[field]?.message;
}

export function ReconciliationForm({ patientId }: { patientId?: string | null }) {
  const mutation = useCreateDowntimeReconciliation();
  const [defaultTimes] = useState(() => {
    const now = new Date();
    return {
      occurred_at: toDateTimeLocal(new Date(now.getTime() - 60 * 60 * 1000)),
      transcribed_at: toDateTimeLocal(new Date(now.getTime() - 30 * 60 * 1000)),
    };
  });
  const form = useForm<ReconciliationFormValues>({
    resolver: zodResolver(reconciliationFormSchema),
    defaultValues: {
      form_serial: "",
      patient_id: patientId ?? "",
      encounter_id: "",
      occurred_at: defaultTimes.occurred_at,
      transcribed_at: defaultTimes.transcribed_at,
      transcriber_id: "",
      clinical_reviewer_id: "",
      record_id: "",
      record_version: 1,
      outcome: "RECONCILED",
      notes: "",
    },
  });
  const errors = form.formState.errors;
  const outcome = useWatch({ control: form.control, name: "outcome" });

  async function onSubmit(values: ReconciliationFormValues) {
    const input: DowntimeReconciliationCreate = {
      form_serial: values.form_serial.trim(),
      patient_id: values.patient_id,
      encounter_id: values.encounter_id,
      occurred_at: formDateToUtc(values.occurred_at),
      transcribed_at: formDateToUtc(values.transcribed_at),
      transcriber_id: values.transcriber_id,
      clinical_reviewer_id: values.clinical_reviewer_id,
      local_entries: [{ record_id: values.record_id, version: values.record_version }],
      outcome: values.outcome,
    };
    await mutation.mutateAsync(input);
  }

  const apiMessage = mutation.error instanceof ApiError ? mutation.error.message : null;

  return (
    <Card>
      <CardHeader className="border-b border-border/70 px-5 py-5 sm:px-6">
        <CardTitle className="text-lg">Reconcile a paper form</CardTitle>
        <CardDescription>
          Verify metadata and existing local record versions. This does not create a clinical entry.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-5 py-5 sm:px-6">
        <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Form serial" error={fieldError(errors, "form_serial")}>
              <Input
                {...form.register("form_serial")}
                aria-label="Form serial"
                aria-invalid={Boolean(errors.form_serial)}
                placeholder="UNITY-DT-20260920-0001"
              />
            </Field>
            <Field label="Outcome" error={fieldError(errors, "outcome")}>
              <Select
                value={outcome}
                onValueChange={(value) =>
                  form.setValue("outcome", value as ReconciliationFormValues["outcome"])
                }
              >
                <SelectTrigger aria-label="Outcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECONCILED">Reconciled</SelectItem>
                  <SelectItem value="DISCREPANCY_REQUIRES_REVIEW">
                    Discrepancy requires review
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Patient ID"
              error={fieldError(errors, "patient_id")}
              hint="The patient ID associated with this paper form."
            >
              <Input
                {...form.register("patient_id")}
                aria-label="Patient ID"
                readOnly={Boolean(patientId)}
                aria-invalid={Boolean(errors.patient_id)}
              />
            </Field>
            <Field label="Encounter ID" error={fieldError(errors, "encounter_id")}>
              <Input
                {...form.register("encounter_id")}
                aria-label="Encounter ID"
                aria-invalid={Boolean(errors.encounter_id)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Occurred at" error={fieldError(errors, "occurred_at")}>
              <Input
                type="datetime-local"
                {...form.register("occurred_at")}
                aria-label="Occurred at"
                aria-invalid={Boolean(errors.occurred_at)}
              />
            </Field>
            <Field label="Transcribed at" error={fieldError(errors, "transcribed_at")}>
              <Input
                type="datetime-local"
                {...form.register("transcribed_at")}
                aria-label="Transcribed at"
                aria-invalid={Boolean(errors.transcribed_at)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Transcriber ID" error={fieldError(errors, "transcriber_id")}>
              <Input
                {...form.register("transcriber_id")}
                aria-label="Transcriber ID"
                aria-invalid={Boolean(errors.transcriber_id)}
              />
            </Field>
            <Field label="Clinical reviewer ID" error={fieldError(errors, "clinical_reviewer_id")}>
              <Input
                {...form.register("clinical_reviewer_id")}
                aria-label="Clinical reviewer ID"
                aria-invalid={Boolean(errors.clinical_reviewer_id)}
              />
            </Field>
            <Field label="Local record ID" error={fieldError(errors, "record_id")}>
              <Input
                {...form.register("record_id")}
                aria-label="Local record ID"
                aria-invalid={Boolean(errors.record_id)}
              />
            </Field>
            <Field label="Record version" error={fieldError(errors, "record_version")}>
              <Input
                type="number"
                min={1}
                {...form.register("record_version", { valueAsNumber: true })}
                aria-label="Record version"
                aria-invalid={Boolean(errors.record_version)}
              />
            </Field>
          </div>

          <Field
            label="Operator note"
            error={fieldError(errors, "notes")}
            hint="Optional recovery notes. Do not include clinical details."
          >
            <Textarea {...form.register("notes")} placeholder="Why this form is being reconciled" />
          </Field>

          {apiMessage ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <WarningCircleIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
                weight="duotone"
              />
              <span>{apiMessage}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <ArrowClockwiseIcon aria-hidden="true" className="animate-spin" />
              ) : (
                <CheckCircleIcon aria-hidden="true" />
              )}
              {mutation.isPending ? "Verifying form" : "Reconcile paper form"}
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              The same form serial can be retried safely.
            </p>
          </div>
        </form>
        {mutation.data ? <ReconciliationResult result={mutation.data} /> : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

"use client";

import { FormFieldError } from "@/components/form-field-error";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@phosphor-icons/react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { RecordCreate } from "@/lib/api/contracts/records";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateLocalRecord } from "@/hooks/patient-records";
import { vitalSchema, type VitalInput, type VitalValues } from "../schemas";
import { getRecordErrorMessage } from "../utils/format";

export function VitalComposer({
  patientId,
  encounterId,
}: {
  patientId: string;
  encounterId: string;
}) {
  const form = useForm<VitalInput, unknown, VitalValues>({
    resolver: zodResolver(vitalSchema),
    defaultValues: { name: "", unit: "" },
  });
  const mutation = useCreateLocalRecord();
  const onSubmit = form.handleSubmit((values) => {
    const input: RecordCreate = {
      encounter_id: encounterId,
      subtype: "vital",
      observed_at: new Date().toISOString(),
      payload: { name: values.name, value: values.value, unit: values.unit },
      references: [],
    };
    mutation.mutate(
      { patientId, domain: "vitals", input },
      {
        onSuccess: () => {
          form.reset();
          toast.success("Vital added");
        },
        onError: (error) => toast.error(getRecordErrorMessage(error)),
      },
    );
  });
  return (
    <Card className="border-primary/25 bg-primary/3">
      <CardHeader className="px-5 py-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlusIcon aria-hidden="true" className="size-4 text-primary" />
          Add vital
        </CardTitle>
        <CardDescription>
          Record one measured value against the open Unity encounter.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 sm:px-6">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end"
          onSubmit={onSubmit}
        >
          <div className="space-y-1.5">
            <Label htmlFor="vital-name">Measure</Label>
            <Input
              id="vital-name"
              placeholder="Temperature"
              {...form.register("name")}
              aria-invalid={Boolean(form.formState.errors.name)}
            />
            {form.formState.errors.name ? (
              <FormFieldError message={form.formState.errors.name.message} />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vital-value">Value</Label>
            <Input
              id="vital-value"
              type="number"
              step="any"
              {...form.register("value", { valueAsNumber: true })}
              aria-invalid={Boolean(form.formState.errors.value)}
            />
            {form.formState.errors.value ? (
              <FormFieldError message={form.formState.errors.value.message} />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vital-unit">Unit</Label>
            <Input
              id="vital-unit"
              placeholder="°C"
              {...form.register("unit")}
              aria-invalid={Boolean(form.formState.errors.unit)}
            />
            {form.formState.errors.unit ? (
              <FormFieldError message={form.formState.errors.unit.message} />
            ) : null}
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { FormFieldError } from "@/components/form-field-error";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon, PlusIcon } from "@phosphor-icons/react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { RecordCreate } from "@/lib/api/contracts/records";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateLocalRecord } from "@/hooks/patient-records";
import { noteSchema, type NoteValues } from "../schemas";
import { getRecordErrorMessage } from "../utils/format";

export function NursingNoteComposer({
  patientId,
  encounterId,
}: {
  patientId: string;
  encounterId: string;
}) {
  const form = useForm<NoteValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: { text: "" },
  });
  const mutation = useCreateLocalRecord();
  const onSubmit = form.handleSubmit((values) => {
    const input: RecordCreate = {
      encounter_id: encounterId,
      subtype: "nursing_note",
      observed_at: new Date().toISOString(),
      payload: { text: values.text },
      references: [],
    };
    mutation.mutate(
      { patientId, domain: "nursing_notes", input },
      {
        onSuccess: () => {
          form.reset();
          toast.success("Nursing note added");
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
          Add nursing note
        </CardTitle>
        <CardDescription>
          Saved to the open Unity encounter with your signed-in identity.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 sm:px-6">
        <form className="space-y-3" onSubmit={onSubmit}>
          <Label htmlFor="nursing-note">Note</Label>
          <Textarea
            id="nursing-note"
            placeholder="Document the relevant observation or action…"
            {...form.register("text")}
            aria-invalid={Boolean(form.formState.errors.text)}
          />
          {form.formState.errors.text ? (
            <FormFieldError message={form.formState.errors.text.message} />
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save note"}
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

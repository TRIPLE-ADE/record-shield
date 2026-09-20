"use client";

import { FormFieldError } from "@/components/form-field-error";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { ClinicalRecord, RecordCorrection } from "@/lib/api/contracts/records";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCorrectLocalRecord } from "@/hooks/patient-records";
import { correctionSchema, type CorrectionValues } from "../schemas";
import { getRecordErrorMessage } from "../utils/format";

export function CorrectionDialog({
  record,
  open,
  onOpenChange,
}: {
  record: ClinicalRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currentText = "text" in record.payload ? record.payload.text : "";
  const form = useForm<CorrectionValues>({
    resolver: zodResolver(correctionSchema),
    defaultValues: { text: currentText, correction_reason: "" },
  });
  const mutation = useCorrectLocalRecord();
  const onSubmit = form.handleSubmit((values) => {
    const input: RecordCorrection = {
      payload: { text: values.text },
      correction_reason: values.correction_reason,
    };
    mutation.mutate(
      { recordId: record.id, version: record.version, input },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success("Record correction saved");
        },
        onError: (error) => toast.error(getRecordErrorMessage(error)),
      },
    );
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct nursing note</DialogTitle>
          <DialogDescription>
            This creates a new version and keeps the previous note in the audit history.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="correction-text">Corrected note</Label>
            <Textarea
              id="correction-text"
              {...form.register("text")}
              aria-invalid={Boolean(form.formState.errors.text)}
            />
            {form.formState.errors.text ? (
              <FormFieldError message={form.formState.errors.text.message} />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="correction-reason">Reason for correction</Label>
            <Textarea
              id="correction-reason"
              placeholder="Explain what changed and why…"
              {...form.register("correction_reason")}
              aria-invalid={Boolean(form.formState.errors.correction_reason)}
            />
            {form.formState.errors.correction_reason ? (
              <FormFieldError message={form.formState.errors.correction_reason.message} />
            ) : null}
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save correction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

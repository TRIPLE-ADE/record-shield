"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { toast } from "sonner";
import { FormFieldError } from "@/components/form-field-error";
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
import { useReviewSecurityAlert } from "@/hooks/security";
import {
  reviewAlertSchema,
  type ReviewAlert,
  type SecurityAlert,
} from "@/lib/api/contracts/security";
import { alertStatusLabel, formatIdentifier } from "../utils/format";

export function AlertReviewDialog({ alert }: { alert: SecurityAlert }) {
  const [open, setOpen] = useState(false);
  const mutation = useReviewSecurityAlert();
  const form = useForm<ReviewAlert>({
    resolver: zodResolver(reviewAlertSchema),
    defaultValues: {
      target_status: alert.status === "REVIEW_REQUIRED" ? "IN_REVIEW" : "RESOLVED_LEGITIMATE",
      explanation: "",
      expected_version: alert.version,
    },
  });

  const submit = form.handleSubmit((input) => {
    mutation.mutate(
      { alertId: alert.id, input },
      {
        onSuccess: () => {
          setOpen(false);
          form.reset({ ...input, explanation: "", expected_version: alert.version + 1 });
          toast.success("Alert review recorded");
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Review could not be saved."),
      },
    );
  });

  const canResolve = alert.status === "IN_REVIEW";
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Review
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review security alert</DialogTitle>
            <DialogDescription>
              Alert {formatIdentifier(alert.id)} is currently{" "}
              {alertStatusLabel(alert).toLowerCase()}. The original event remains retained.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor={`alert-explanation-${alert.id}`}>Review explanation</Label>
              <Textarea
                id={`alert-explanation-${alert.id}`}
                placeholder="Describe the evidence and decision…"
                {...form.register("explanation")}
                aria-invalid={Boolean(form.formState.errors.explanation)}
              />
              {form.formState.errors.explanation ? (
                <FormFieldError message={form.formState.errors.explanation.message} />
              ) : null}
            </div>
            <input type="hidden" {...form.register("target_status")} />
            <DialogFooter showCloseButton>
              {canResolve ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => {
                      form.setValue("target_status", "RESOLVED_LEGITIMATE");
                      void submit();
                    }}
                  >
                    Resolve as legitimate
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={mutation.isPending}
                    onClick={() => {
                      form.setValue("target_status", "RESOLVED_SUSPECTED_MISUSE");
                      void submit();
                    }}
                  >
                    Mark suspected misuse
                  </Button>
                </>
              ) : (
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Saving…" : "Start review"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

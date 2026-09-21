"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheckIcon } from "@phosphor-icons/react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  emergencyJustificationCreateSchema,
  type EmergencySession,
} from "@/lib/api/contracts/emergency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitEmergencyJustification } from "@/hooks/emergency";
import { getEmergencyErrorMessage } from "../utils/format";

export function JustificationCard({ session }: { session: EmergencySession }) {
  const justify = useSubmitEmergencyJustification();
  const form = useForm<z.infer<typeof emergencyJustificationCreateSchema>>({
    resolver: zodResolver(emergencyJustificationCreateSchema),
    defaultValues: { narrative: "" },
    mode: "onChange",
  });
  const narrative = useWatch({ control: form.control, name: "narrative" }) ?? "";

  function submit(values: z.infer<typeof emergencyJustificationCreateSchema>) {
    justify.mutate(
      { sessionId: session.id, input: values },
      {
        onSuccess: () => {
          form.reset();
          toast.success("Clinical review submitted");
        },
        onError: (error) => toast.error(getEmergencyErrorMessage(error)),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="px-5 py-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheckIcon aria-hidden="true" className="size-4 text-primary" weight="duotone" />
          Clinical review
        </CardTitle>
        <CardDescription>
          {session.justification_status === "SUBMITTED"
            ? "A review has been recorded for this session. Add another note only if the clinical rationale changes."
            : "Explain why emergency access was needed before the review deadline."}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form className="space-y-3" onSubmit={form.handleSubmit(submit)}>
          <Textarea
            {...form.register("narrative")}
            rows={4}
            minLength={20}
            maxLength={1000}
            placeholder="Summarize the clinical decision and why this access was necessary…"
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {session.justification_status === "JUSTIFICATION_OVERDUE"
                ? "Overdue review"
                : "20–1000 characters"}
            </span>
            <span className="tabular-nums">{narrative.length}/1000</span>
          </div>
          <Button
            type="submit"
            variant={
              session.justification_status === "JUSTIFICATION_OVERDUE" ? "destructive" : "outline"
            }
            disabled={!form.formState.isValid || justify.isPending}
            className="w-full"
          >
            {justify.isPending ? "Submitting…" : "Submit clinical review"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

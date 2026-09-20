"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { emergencyActivateSchema } from "@/lib/api/contracts/emergency";
import { useActivateEmergency } from "@/hooks/emergency";
import { emergencyActivationFormSchema, type EmergencyActivateFormValues } from "../schemas";
import type { EmergencyWorkspaceProps } from "../types";
import { getEmergencyErrorMessage } from "../utils/format";
import { ActivationView } from "./activation-view";

export function EmergencyActivation({
  patientId,
  patientName,
  organizationName,
  encounterId,
  sessionContext,
  sources,
  onActivated,
}: EmergencyWorkspaceProps & { onActivated: (sessionId: string) => void }) {
  const selectedSourceId = sources[0]?.organization.organization_id ?? "";
  const activate = useActivateEmergency();
  const activationForm = useForm<EmergencyActivateFormValues>({
    resolver: zodResolver(emergencyActivationFormSchema),
    defaultValues: {
      patient_id: patientId,
      source_org_id: selectedSourceId,
      receiving_encounter_id: encounterId,
      reason_code: "IMMEDIATE_THREAT",
      necessity_confirmed: false,
    },
    mode: "onChange",
  });
  const necessityConfirmed = useWatch({
    control: activationForm.control,
    name: "necessity_confirmed",
  });

  function submitActivation(values: EmergencyActivateFormValues) {
    const input = emergencyActivateSchema.parse({
      ...values,
      necessity_confirmed: true,
      patient_id: patientId,
      source_org_id: values.source_org_id || selectedSourceId,
      receiving_encounter_id: encounterId,
    });
    activate.mutate(input, {
      onSuccess: (result) => {
        onActivated(result.session.id);
        toast.success("Emergency summary activated");
      },
      onError: (error) => toast.error(getEmergencyErrorMessage(error)),
    });
  }

  return (
    <ActivationView
      patientId={patientId}
      patientName={patientName}
      organizationName={organizationName}
      encounterId={encounterId}
      sources={sources}
      sessionContext={sessionContext}
      form={activationForm}
      necessityConfirmed={Boolean(necessityConfirmed)}
      isSubmitting={activate.isPending}
      onSubmit={submitActivation}
    />
  );
}

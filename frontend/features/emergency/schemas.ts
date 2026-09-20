import { z } from "zod";
import { emergencyActivateSchema } from "@/lib/api/contracts/emergency";

export const emergencyActivationFormSchema = emergencyActivateSchema.extend({
  necessity_confirmed: z.boolean().refine(Boolean, "Confirm necessity before activating."),
});

export type EmergencyActivateFormValues = z.input<typeof emergencyActivationFormSchema>;

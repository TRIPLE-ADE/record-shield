import type { ExchangeDomain } from "@/lib/api/contracts/exchange";

export const requestDomains: Array<{ value: ExchangeDomain; label: string; description: string }> =
  [
    { value: "allergies", label: "Allergies", description: "Known reactions and status" },
    { value: "medications", label: "Medications", description: "Active medication list" },
    { value: "investigations", label: "Investigations", description: "Selected source results" },
    { value: "diagnoses", label: "Diagnoses", description: "Relevant diagnoses" },
  ];

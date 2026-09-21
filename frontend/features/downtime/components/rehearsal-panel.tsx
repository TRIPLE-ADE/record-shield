"use client";

import { CheckCircleIcon, ListChecksIcon } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const rehearsalSteps = [
  "Sign in with an individual Mercy or Unity identity.",
  "Confirm the hospital, role, ward, and active shift.",
  "Open the known local patient context.",
  "Review a permitted local domain with source provenance.",
  "Create a local Unity note and observe its audit receipt.",
  "Discover the other verified source for the same Health ID.",
  "Request a narrow read-only consent scope.",
  "Approve the selected scope in the patient portal.",
  "Read the remote record only after the grant is active.",
  "Revoke the grant and confirm the next read is denied.",
  "Activate the bounded emergency summary when eligible.",
  "Expand one domain with a justification and observe expiry.",
  "Review metadata-only security evidence.",
  "Verify a valid chain and then rehearse a tamper signal.",
  "Reconcile one downtime form and retry its serial safely.",
];

export function RehearsalPanel() {
  return (
    <Card>
      <CardHeader className="px-5 py-5 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecksIcon aria-hidden="true" className="size-4 text-primary" weight="duotone" />
          Two-hospital rehearsal
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          A compact runbook for the judge-facing flow.
        </p>
      </CardHeader>
      <CardContent className="grid gap-x-6 gap-y-3 px-5 pb-5 sm:grid-cols-2 sm:px-6">
        {rehearsalSteps.map((step, index) => (
          <div key={step} className="flex items-start gap-2 text-sm leading-5">
            <CheckCircleIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-primary"
              weight="duotone"
            />
            <span>
              <span className="mr-1 text-xs font-semibold text-muted-foreground">{index + 1}.</span>
              {step}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

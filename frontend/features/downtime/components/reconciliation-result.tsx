"use client";

import { CheckCircleIcon, CopySimpleIcon, FingerprintIcon } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DowntimeReconciliationResponse } from "@/lib/api/contracts/downtime";
import { formatDateTime } from "../utils/format";

export function ReconciliationResult({ result }: { result: DowntimeReconciliationResponse }) {
  return (
    <Card className="border-success/30 bg-success/5">
      <CardHeader className="px-5 py-5 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircleIcon aria-hidden="true" className="size-5 text-success" weight="duotone" />
          Reconciliation recorded
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          The time care was provided is saved separately from the time this form was entered.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 pb-5 text-sm sm:grid-cols-2 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Form serial
          </p>
          <p className="mt-1 font-medium">{result.form_serial}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Outcome
          </p>
          <p className="mt-1 font-medium">
            {result.outcome === "RECONCILED" ? "Reconciled" : "Discrepancy requires review"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Occurred at
          </p>
          <p className="mt-1 font-medium">{formatDateTime(result.occurred_at)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Recorded at
          </p>
          <p className="mt-1 font-medium">{formatDateTime(result.recorded_at)}</p>
        </div>
        <div className="flex items-start gap-2 text-xs text-muted-foreground sm:col-span-2">
          <FingerprintIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="break-all">
            Audit reference {result.audit_event_id} · Support reference {result.correlation_id}
          </span>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
          <CopySimpleIcon aria-hidden="true" className="size-3.5" />
          You can safely retry this form if its reference and details are unchanged.
        </p>
      </CardContent>
    </Card>
  );
}

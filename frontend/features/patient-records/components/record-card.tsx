"use client";

import { useState } from "react";
import { ClockIcon, DatabaseIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import type { ClinicalRecord } from "@/lib/api/contracts/records";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { domainMeta } from "../data/domain-meta";
import { formatRecordDate, formatSubtype, sensitivityClass } from "../utils/format";
import { RecordPayload } from "./record-payload";
import { CorrectionDialog } from "./correction-dialog";

export function RecordCard({
  record,
  canCorrect,
}: {
  record: ClinicalRecord;
  canCorrect: boolean;
}) {
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const meta = domainMeta[record.domain];
  const Icon = meta.icon;
  const canCorrectNote =
    canCorrect && record.domain === "nursing_notes" && "text" in record.payload;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/65 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-primary">
            <Icon aria-hidden="true" className="size-4" weight="duotone" />
          </span>
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{formatSubtype(record.subtype)}</CardTitle>
            <CardDescription className="mt-1">
              Recorded {formatRecordDate(record.recorded_at)}
            </CardDescription>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${sensitivityClass(record.sensitivity)}`}
          >
            {record.sensitivity.charAt(0) + record.sensitivity.slice(1).toLowerCase()}
          </span>
          {canCorrectNote ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Correct record"
              onClick={() => setCorrectionOpen(true)}
            >
              <PencilSimpleIcon aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-4 sm:px-6">
        <RecordPayload payload={record.payload} />
        <Separator />
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <span className="inline-flex items-center gap-2 truncate" title={record.source.record_id}>
            <DatabaseIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            {record.source.local_patient_id} · v{record.version}
          </span>
          <span className="inline-flex items-center gap-2 sm:justify-end">
            <ClockIcon aria-hidden="true" className="size-3.5 shrink-0" />
            Observed {formatRecordDate(record.observed_at)}
          </span>
        </div>
      </CardContent>
      {canCorrectNote ? (
        <CorrectionDialog record={record} open={correctionOpen} onOpenChange={setCorrectionOpen} />
      ) : null}
    </Card>
  );
}

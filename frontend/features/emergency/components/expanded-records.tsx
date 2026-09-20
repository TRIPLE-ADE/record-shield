"use client";

import { ArrowRightIcon } from "@phosphor-icons/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRecordPayload } from "../utils/format";
import { formatUtcDate } from "@/utils/formatters";

export function ExpandedRecords({
  records,
  isLoading,
}: {
  records?: {
    items: Array<{
      id: string;
      domain: string;
      subtype: string;
      recorded_at: string;
      payload: Record<string, unknown>;
    }>;
    completeness_notice: string;
  };
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="px-5 py-5 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowRightIcon aria-hidden="true" className="size-5 text-primary" />
          Level 2 records
        </CardTitle>
        <CardDescription>Only the explicitly requested domains appear here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-6 sm:px-6">
        {isLoading ? <Skeleton className="h-24 rounded-xl" /> : null}
        {!isLoading && !records ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No Level 2 domain has been requested.
          </p>
        ) : null}
        {records?.items.map((record) => (
          <div key={record.id} className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold capitalize">
                {record.domain.replaceAll("_", " ")}
              </p>
              <span className="text-xs text-muted-foreground">{record.subtype}</span>
            </div>
            <p className="mt-2 text-sm leading-6">{formatRecordPayload(record.payload)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Recorded {formatUtcDate(record.recorded_at)}
            </p>
          </div>
        ))}
        {records ? (
          <p className="text-xs leading-5 text-muted-foreground">{records.completeness_notice}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

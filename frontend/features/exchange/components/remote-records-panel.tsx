"use client";

import { DatabaseIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { formatDomain } from "@/utils/formatters";
import type { ConsentRequestStatusCollection } from "@/lib/api/contracts/exchange";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRemoteRecords } from "@/hooks/exchange";
import { RemoteRecord } from "./remote-record";
import { ExchangeError } from "./exchange-error";
import { ExchangeState } from "./exchange-state";

export function RemoteRecordsPanel({
  activeGrant,
  remote,
}: {
  activeGrant: NonNullable<ConsentRequestStatusCollection["items"][number]["grant"]> | undefined;
  remote: ReturnType<typeof useRemoteRecords>;
}) {
  return (
    <Card>
      <CardHeader className="px-5 py-5 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheckIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
          Approved remote records
        </CardTitle>
        <CardDescription>
          View the records the patient has approved for you to access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5 sm:px-6">
        {!activeGrant ? (
          <ExchangeState
            kind="empty"
            title="Waiting for patient approval"
            description="Select approved access above, or send a request to the patient to share records."
            compact
          />
        ) : remote.isPending || remote.isFetching ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : remote.error ? (
          <ExchangeError error={remote.error} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2.5 text-xs">
              <span className="inline-flex items-center gap-2 font-medium">
                <DatabaseIcon aria-hidden="true" className="size-4 text-primary" />
                {activeGrant.source.name}
              </span>
              <span className="text-muted-foreground">
                Records: {activeGrant.domains.map(formatDomain).join(" · ")}
              </span>
            </div>
            {remote.data?.items.map((record) => (
              <RemoteRecord key={`${record.id}:${record.version}`} record={record} />
            ))}
            {!remote.data?.items.length ? (
              <ExchangeState
                kind="empty"
                title="No approved records returned"
                description="No records were returned for this access request. Information may be unavailable or protected; this does not confirm the absence of a condition."
                compact
              />
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

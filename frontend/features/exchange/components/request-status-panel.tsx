"use client";

import { ClockIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCancelConsent, useConsentRequests } from "@/hooks/exchange";
import { RequestStatus } from "./request-status";
import { ExchangeError } from "./exchange-error";
import { ExchangeState } from "./exchange-state";
import { formatDomain, formatUtcDate } from "@/utils/formatters";

export function RequestStatusPanel({
  requests,
}: {
  requests: ReturnType<typeof useConsentRequests>;
}) {
  const cancelMutation = useCancelConsent();
  return (
    <Card>
      <CardHeader className="px-5 py-5 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClockIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
          Request status
        </CardTitle>
        <CardDescription>
          Track patient decisions and the duration of approved access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5 sm:px-6">
        {requests.isPending ? <Skeleton className="h-24 rounded-xl" /> : null}
        {requests.error ? <ExchangeError error={requests.error} /> : null}
        {!requests.error &&
          requests.data?.items.map(({ request, grant }) => (
            <div key={request.id} className="rounded-xl border border-border/70 bg-card/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{request.source.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {request.requested_domains.map(formatDomain).join(" · ")}
                  </p>
                </div>
                <RequestStatus status={request.status} />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{request.reason}</p>
              {grant?.status === "ACTIVE" ? (
                <p className="mt-3 text-xs font-medium text-success">
                  Approved until {formatUtcDate(grant.expires_at)}
                </p>
              ) : null}
              {request.status === "PENDING" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  disabled={cancelMutation.isPending}
                  onClick={() =>
                    cancelMutation.mutate(
                      { requestId: request.id, input: { expected_version: request.version } },
                      {
                        onSuccess: () => toast.success("Consent request cancelled"),
                        onError: (error) => toast.error(getApiErrorMessage(error)),
                      },
                    )
                  }
                >
                  Cancel request
                </Button>
              ) : null}
            </div>
          ))}
        {!requests.error && requests.hasNextPage ? (
          <Button
            variant="outline"
            size="sm"
            disabled={requests.isFetchingNextPage}
            onClick={() => requests.fetchNextPage()}
          >
            {requests.isFetchingNextPage ? "Loading…" : "Load more requests"}
          </Button>
        ) : null}
        {!requests.isPending && !requests.error && !requests.data?.items.length ? (
          <ExchangeState
            kind="empty"
            title="No requests yet"
            description="Approved source access will appear here with its expiry."
            compact
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

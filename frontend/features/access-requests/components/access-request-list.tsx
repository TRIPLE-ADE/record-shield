"use client";

import { useSession } from "@/hooks/auth";
import { usePatientDirectory } from "@/hooks/patients";
import { useCurrentTime } from "@/hooks/use-current-time";
import { useState } from "react";
import Link from "next/link";
import { useConsentRequests } from "@/hooks/exchange";
import { AccessRequestItem } from "./access-request-item";
import { Button } from "@/components/ui/button";

export function AccessRequestList({ compact = false }: { compact?: boolean }) {
  const now = useCurrentTime();
  const { data: context } = useSession();
  const patients = usePatientDirectory({
    enabled: Boolean(context?.permissions_summary.includes("local_records.read_with_context")),
    scopeKey: `${context?.user.id}:${context?.organization?.organization_id ?? "none"}`,
  });
  const names = new Map(
    patients.error
      ? []
      : (patients.data?.pages.flatMap((page) =>
          page.items.map((item) => [item.patient_id, item.name] as const),
        ) ?? []),
  );
  const requests = useConsentRequests();
  const [filter, setFilter] = useState("all");
  const items = requests.data?.items ?? [];
  const filtered = items.filter(
    ({ request, grant }) =>
      filter === "all" ||
      (filter === "pending"
        ? request.status === "PENDING"
        : grant?.status === "ACTIVE" && new Date(grant.expires_at).getTime() > now),
  );
  const visible = compact ? filtered.slice(0, 4) : filtered;
  return (
    <div>
      {!compact ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <label htmlFor="request-filter" className="text-sm font-medium">
            Filter loaded requests
          </label>
          <select
            id="request-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All requests</option>
            <option value="pending">Awaiting approval</option>
            <option value="ready">Ready to view</option>
          </select>
          <Link
            href="/workspace/patients"
            className="ml-auto text-sm font-medium text-primary hover:underline"
          >
            Request records for a patient
          </Link>
        </div>
      ) : null}
      {requests.isPending ? (
        <output className="p-5 text-sm text-muted-foreground">Loading access requests…</output>
      ) : requests.error ? (
        <div role="alert" className="p-5">
          <p className="text-sm">
            Access requests are unavailable. Try again to check the latest status.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => requests.refetch()}>
            Try again
          </Button>
        </div>
      ) : visible.length ? (
        <ul className="divide-y divide-border">
          {visible.map(({ request, grant }) => (
            <AccessRequestItem
              key={request.id}
              request={request}
              grant={grant}
              patientName={names.get(request.patient_id)}
              now={now}
            />
          ))}
        </ul>
      ) : (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-medium">
            {filter === "all" ? "No requests yet" : "No matching requests loaded"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {filter === "all"
              ? "Open a patient and choose Request records to ask for records from another facility."
              : "Choose another filter, or load more requests if available."}
          </p>
        </div>
      )}
      {!requests.error && requests.data?.next_cursor ? (
        <p className="border-t border-border p-4 text-xs text-muted-foreground">
          {compact ? (
            <Link href="/workspace/requests" className="text-primary">
              View all requests
            </Link>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => requests.fetchNextPage()}
              disabled={requests.isFetchingNextPage}
            >
              {requests.isFetchingNextPage ? "Loading…" : "Load more requests"}
            </Button>
          )}
        </p>
      ) : null}
    </div>
  );
}

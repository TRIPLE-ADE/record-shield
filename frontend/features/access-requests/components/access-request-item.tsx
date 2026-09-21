"use client";

import Link from "next/link";
import type { ConsentRequestStatus } from "@/lib/api/contracts/exchange";
import { RequestStatus } from "@/features/exchange/components/request-status";
import { formatDomain, formatUtcDate } from "@/utils/formatters";

export function AccessRequestItem({
  request,
  grant,
  patientName,
  now,
}: ConsentRequestStatus & { patientName?: string; now: number }) {
  return (
    <li className="flex flex-wrap items-center gap-4 px-5 py-4">
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium">{patientName ?? "Patient request"}</p>
        <p className="mt-1 text-xs text-muted-foreground">From {request.source.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {request.requested_domains.map(formatDomain).join(" · ")}
        </p>
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{request.reason}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Requested {formatUtcDate(request.created_at)}
        </p>
      </div>
      <RequestStatus
        status={
          grant && (grant.status !== "ACTIVE" || new Date(grant.expires_at).getTime() <= now)
            ? grant.status === "REVOKED"
              ? "REVOKED"
              : "EXPIRED"
            : request.status
        }
      />
      <Link
        href={`/workspace/patients/${request.patient_id}/exchange`}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        Open request
      </Link>
    </li>
  );
}

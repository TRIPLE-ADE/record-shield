"use client";

import { useConsentRequests, useRemoteRecords } from "@/hooks/exchange";
import { ExchangeHeader } from "./exchange-header";
import { SourceRequestPanel } from "./source-request-panel";
import { RequestStatusPanel } from "./request-status-panel";
import { RemoteRecordsPanel } from "./remote-records-panel";

export function ExchangeWorkspace({
  patientId,
  patientName,
  organizationName,
  receivingEncounterId,
}: {
  patientId: string;
  patientName?: string;
  organizationName: string;
  receivingEncounterId: string;
}) {
  const requests = useConsentRequests(patientId);
  const activeGrant =
    requests.data?.items.find(
      (item) => item.grant?.status === "ACTIVE" && item.grant.expires_at > new Date().toISOString(),
    )?.grant ?? undefined;
  const activeRequest = activeGrant
    ? requests.data?.items.find((item) => item.grant?.id === activeGrant.id)?.request
    : undefined;
  const remote = useRemoteRecords(
    patientId,
    activeGrant?.source_org_id ?? "",
    activeGrant?.id ?? "",
    activeGrant?.domains ?? [],
    Boolean(activeGrant),
  );

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-10 lg:py-10"
    >
      <ExchangeHeader
        patientId={patientId}
        patientName={patientName}
        organizationName={organizationName}
      />
      <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <SourceRequestPanel patientId={patientId} receivingEncounterId={receivingEncounterId} />
      </section>
      <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <RequestStatusPanel requests={requests} />
        <RemoteRecordsPanel activeGrant={activeGrant} remote={remote} />
      </section>
      {activeRequest ? (
        <p className="mt-5 text-xs text-muted-foreground">
          Request bound to {activeRequest.practitioner_name} · {activeRequest.recipient.name} ·
          read-only scope
        </p>
      ) : null}
    </main>
  );
}

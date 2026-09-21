"use client";

import { VisitSelect } from "@/components/visit-select";
import type { Encounter } from "@/lib/api/contracts/records";
import { useCurrentTime } from "@/hooks/use-current-time";
import { useState } from "react";
import { formatDomain, formatUtcDate } from "@/utils/formatters";
import { useConsentRequests, useRemoteRecords } from "@/hooks/exchange";
import { ExchangeHeader } from "./exchange-header";
import { SourceRequestPanel } from "./source-request-panel";
import { RequestStatusPanel } from "./request-status-panel";
import { RemoteRecordsPanel } from "./remote-records-panel";

export function ExchangeWorkspace({
  patientId,
  patientName,
  organizationName,
  encounters,
}: {
  patientId: string;
  patientName?: string;
  organizationName: string;
  encounters: Encounter[];
}) {
  const now = useCurrentTime();
  const [selectedEncounter, setSelectedEncounter] = useState("");
  const receivingEncounterId =
    encounters.find((item) => item.id === selectedEncounter)?.id ?? encounters[0]?.id ?? "";
  const requests = useConsentRequests(patientId);
  const [selectedGrantId, setSelectedGrantId] = useState("");
  const availableGrants = requests.error
    ? []
    : (requests.data?.items.flatMap(({ grant }) =>
        grant?.status === "ACTIVE" && new Date(grant.expires_at).getTime() > now ? [grant] : [],
      ) ?? []);
  const activeGrant = selectedGrantId
    ? availableGrants.find((grant) => grant.id === selectedGrantId)
    : availableGrants[0];
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
      <div className="mt-6">
        <VisitSelect
          encounters={encounters}
          value={receivingEncounterId}
          onChange={setSelectedEncounter}
        />
      </div>
      <ol
        aria-label="Record sharing steps"
        className="mt-6 grid gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3"
      >
        <li>
          <span className="font-semibold">1. Request records</span>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose a facility and the records you need.
          </p>
        </li>
        <li>
          <span className="font-semibold">2. Patient approval</span>
          <p className="mt-1 text-xs text-muted-foreground">
            The patient chooses what to share and for how long.
          </p>
        </li>
        <li>
          <span className="font-semibold">3. View records</span>
          <p className="mt-1 text-xs text-muted-foreground">
            Read approved records with their source and expiry.
          </p>
        </li>
      </ol>
      <section className="mt-6">
        <SourceRequestPanel patientId={patientId} receivingEncounterId={receivingEncounterId} />
      </section>
      <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <RequestStatusPanel requests={requests} />
        <div className="space-y-3">
          {availableGrants.length ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <label htmlFor="approved-source" className="text-sm font-medium">
                Approved access
              </label>
              <select
                id="approved-source"
                value={activeGrant?.id ?? ""}
                onChange={(event) => setSelectedGrantId(event.target.value)}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Choose approved access
                </option>
                {availableGrants.map((grant) => (
                  <option key={grant.id} value={grant.id}>
                    {grant.source.name} · {grant.domains.map(formatDomain).join(", ")} · until{" "}
                    {formatUtcDate(grant.expires_at)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <RemoteRecordsPanel activeGrant={activeGrant} remote={remote} />
        </div>
      </section>
      {activeRequest ? (
        <p className="mt-5 text-xs text-muted-foreground">
          Requested by {activeRequest.practitioner_name} · {activeRequest.recipient.name} ·
          view-only access
        </p>
      ) : null}
    </main>
  );
}

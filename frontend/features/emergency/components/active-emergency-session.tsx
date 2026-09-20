"use client";

import { useState } from "react";
import { WarningIcon } from "@phosphor-icons/react";
import type { EmergencyDomain } from "@/lib/api/contracts/emergency";
import { Button } from "@/components/ui/button";
import { useEmergencyRecords, useEmergencyStatus } from "@/hooks/emergency";
import { getEmergencyErrorMessage } from "../utils/format";
import { isSessionActive, isUnexpectedEmergencyError } from "../utils/guards";
import { ActiveEmergencyView } from "./active-emergency-view";
import { EmergencyPageFrame } from "./emergency-page-frame";
import { EmergencyState } from "./emergency-state";

export function ActiveEmergencySession({
  patientId,
  patientName,
  organizationName,
  sessionId,
  onReset,
}: {
  patientId: string;
  patientName?: string;
  organizationName: string;
  sessionId: string;
  onReset: () => void;
}) {
  const [expandedDomains, setExpandedDomains] = useState<EmergencyDomain[]>([]);
  const [expansionOpen, setExpansionOpen] = useState(false);
  const session = useEmergencyStatus(sessionId, true);
  const currentSession = session.data?.session;
  const activeDomains = Array.from(
    new Set([...(currentSession?.expanded_domains ?? []), ...expandedDomains]),
  );
  const summary = useEmergencyRecords(sessionId, "summary", [], true);
  const expanded = useEmergencyRecords(
    sessionId,
    "expanded",
    activeDomains,
    Boolean(activeDomains.length && isSessionActive(currentSession)),
  );
  const statusError = session.error ?? summary.error;
  if (isUnexpectedEmergencyError(statusError)) {
    return (
      <EmergencyPageFrame patientId={patientId}>
        <EmergencyState
          icon={<WarningIcon aria-hidden="true" className="size-5" />}
          title="Emergency session unavailable"
          description={getEmergencyErrorMessage(statusError)}
          action={
            <Button type="button" variant="outline" onClick={onReset}>
              Start a new session
            </Button>
          }
        />
      </EmergencyPageFrame>
    );
  }

  const protectedReadAvailable = Boolean(
    currentSession &&
    isSessionActive(currentSession) &&
    !statusError &&
    !summary.error &&
    !expanded.error,
  );
  const summaryData =
    protectedReadAvailable && summary.data?.view === "summary" ? summary.data.summary : undefined;
  const expandedData =
    protectedReadAvailable && expanded.data?.view === "expanded"
      ? expanded.data.records
      : undefined;
  return (
    <ActiveEmergencyView
      patientId={patientId}
      patientName={patientName}
      organizationName={organizationName}
      session={currentSession}
      summary={summaryData}
      summaryPending={summary.isPending}
      summaryError={summary.error}
      expanded={expandedData}
      expandedPending={expanded.isPending}
      activeDomains={activeDomains}
      expansionOpen={expansionOpen}
      onExpansionOpenChange={setExpansionOpen}
      onExpanded={(nextDomains) => {
        setExpandedDomains(nextDomains);
        setExpansionOpen(false);
      }}
      onReset={onReset}
    />
  );
}

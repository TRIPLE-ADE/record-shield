"use client";

import type {
  EmergencyDomain,
  EmergencySession,
  EmergencySummary,
} from "@/lib/api/contracts/emergency";
import { SessionHeader } from "./session-header";
import { SummaryContent } from "./summary-content";
import { ActiveClinicalSections } from "./active-clinical-sections";
import { EndedSessionState } from "./ended-session-state";
import { EmergencyHeader } from "./emergency-header";
import { ExpandedRecords } from "./expanded-records";
import { EmergencyPageFrame } from "./emergency-page-frame";

export function ActiveEmergencyView({
  patientId,
  patientName,
  organizationName,
  session,
  summary,
  summaryPending,
  summaryError,
  expanded,
  expandedPending,
  activeDomains,
  expansionOpen,
  onExpansionOpenChange,
  onExpanded,
  onReset,
}: {
  patientId: string;
  patientName?: string;
  organizationName: string;
  session?: EmergencySession;
  summary?: EmergencySummary;
  summaryPending: boolean;
  summaryError: Error | null;
  expanded?: Parameters<typeof ExpandedRecords>[0]["records"];
  expandedPending: boolean;
  activeDomains: EmergencyDomain[];
  expansionOpen: boolean;
  onExpansionOpenChange: (open: boolean) => void;
  onExpanded: (domains: EmergencyDomain[]) => void;
  onReset: () => void;
}) {
  return (
    <EmergencyPageFrame patientId={patientId}>
      <div className="space-y-6">
        <EmergencyHeader
          patientName={patientName ?? summary?.patient.name}
          organizationName={organizationName}
          session={session}
        />
        <SessionHeader session={session} />
        <SummaryContent summary={summary} isPending={summaryPending} error={summaryError} />
        <ActiveClinicalSections
          session={session}
          expanded={expanded}
          expandedPending={expandedPending}
          activeDomains={activeDomains}
          expansionOpen={expansionOpen}
          onExpansionOpenChange={onExpansionOpenChange}
          onExpanded={onExpanded}
        />
        <EndedSessionState session={session} onReset={onReset} />
      </div>
    </EmergencyPageFrame>
  );
}

"use client";

import type { EmergencyDomain, EmergencySession } from "@/lib/api/contracts/emergency";
import { isSessionActive } from "../utils/guards";
import { ExpandedRecords } from "./expanded-records";
import { ExpansionCard } from "./expansion-card";
import { JustificationCard } from "./justification-card";

export function ActiveClinicalSections({
  session,
  expanded,
  expandedPending,
  activeDomains,
  expansionOpen,
  onExpansionOpenChange,
  onExpanded,
}: {
  session?: EmergencySession;
  expanded?: Parameters<typeof ExpandedRecords>[0]["records"];
  expandedPending: boolean;
  activeDomains: EmergencyDomain[];
  expansionOpen: boolean;
  onExpansionOpenChange: (open: boolean) => void;
  onExpanded: (domains: EmergencyDomain[]) => void;
}) {
  if (!session || !isSessionActive(session)) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <ExpandedRecords records={expanded} isLoading={expandedPending} />
      <div className="space-y-6">
        <ExpansionCard
          session={session}
          open={expansionOpen}
          onOpenChange={onExpansionOpenChange}
          expandedDomains={activeDomains}
          isSubmitting={false}
          onExpanded={onExpanded}
        />
        <JustificationCard session={session} />
      </div>
    </div>
  );
}

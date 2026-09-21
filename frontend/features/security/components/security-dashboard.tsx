"use client";

import { useState } from "react";
import type { SessionContext } from "@/lib/api/contracts/auth";
import type { ChainVerification } from "@/lib/api/contracts/security";
import { useSecurityAlerts, useSecurityEvents } from "@/hooks/security";
import type { SecurityAlertFilters, SecurityEventFilters } from "@/features/security/api";
import { SecurityAlertTable } from "./security-alert-table";
import { ChainVerificationCard } from "./chain-verification-card";
import { SecurityEventTable } from "./security-event-table";
import { SecurityFilters } from "./security-filters";
import { SecurityHeader } from "./security-header";
import { SecuritySummary } from "./security-summary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function getChainStatus(
  result?: ChainVerification,
  unknown?: boolean,
): "valid" | "invalid" | "unknown" | "idle" {
  if (result) {
    return result.status === "VALID" ? "valid" : "invalid";
  }
  if (unknown) {
    return "unknown";
  }
  return "idle";
}

function getAlertCounts(items?: { severity: string; status: string }[]) {
  if (!items) {
    return { openAlerts: 0, criticalCount: 0 };
  }
  const open = items.filter((alert) => !alert.status.startsWith("RESOLVED"));
  return {
    openAlerts: open.length,
    criticalCount: open.filter((alert) => alert.severity === "CRITICAL").length,
  };
}

function SecurityViewTabs({
  view,
  onSelectView,
  streamId,
}: {
  view: "alerts" | "events";
  onSelectView: (view: "alerts" | "events") => void;
  streamId: string;
}) {
  return (
    <CardContent className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-3">
      <div
        className="flex items-center gap-1 rounded-lg bg-muted/55 p-1"
        role="tablist"
        aria-label="Security evidence views"
      >
        <Button
          variant={view === "alerts" ? "secondary" : "ghost"}
          size="sm"
          role="tab"
          aria-selected={view === "alerts"}
          onClick={() => onSelectView("alerts")}
        >
          Alert queue
        </Button>
        <Button
          variant={view === "events" ? "secondary" : "ghost"}
          size="sm"
          role="tab"
          aria-selected={view === "events"}
          onClick={() => onSelectView("events")}
        >
          Event stream
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">Stream {streamId.slice(0, 8)}…</span>
    </CardContent>
  );
}

function SecurityEvidenceTable({
  view,
  alerts,
  events,
  canReview,
}: {
  view: "alerts" | "events";
  alerts: ReturnType<typeof useSecurityAlerts>;
  events: ReturnType<typeof useSecurityEvents>;
  canReview: boolean;
}) {
  if (view === "alerts") {
    return <SecurityAlertTable alerts={alerts.data?.items ?? []} canReview={canReview} />;
  }
  return <SecurityEventTable events={events.data?.items ?? []} />;
}

export function SecurityDashboard({ context }: { context: SessionContext }) {
  const streamId = context.security_stream_id ?? "";
  const [view, setView] = useState<"alerts" | "events">("alerts");
  const [eventFilters, setEventFilters] = useState<SecurityEventFilters>({});
  const [alertFilters, setAlertFilters] = useState<SecurityAlertFilters>({});
  const [chainResult, setChainResult] = useState<ChainVerification>();
  const [chainUnknown, setChainUnknown] = useState(false);
  const events = useSecurityEvents(streamId || undefined, eventFilters);
  const alerts = useSecurityAlerts(streamId || undefined, alertFilters);
  const { openAlerts, criticalCount } = getAlertCounts(alerts.data?.items);
  const sourceName = context.role === "TRUST_OPERATOR" ? undefined : context.organization?.name;
  const canReview = context.role === "SECURITY_ADMIN" || context.role === "TRUST_OPERATOR";

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-10 lg:py-10"
    >
      <SecurityHeader role={context.role} organizationName={sourceName} />
      <section className="mt-7 space-y-5">
        <SecuritySummary
          eventCount={events.data?.items.length ?? 0}
          alertCount={openAlerts}
          criticalCount={criticalCount}
          chainStatus={getChainStatus(chainResult, chainUnknown)}
        />
        <ChainVerificationCard
          streamId={streamId}
          onResult={(result) => {
            setChainUnknown(false);
            setChainResult(result);
          }}
          onUnknown={() => setChainUnknown(true)}
        />
        <Card>
          <SecurityViewTabs view={view} onSelectView={setView} streamId={streamId} />
          <CardContent className="space-y-4 p-4 sm:p-5">
            <SecurityFilters
              view={view}
              eventFilters={eventFilters}
              alertFilters={alertFilters}
              onEventFiltersChange={setEventFilters}
              onAlertFiltersChange={setAlertFilters}
              onReset={() => {
                setEventFilters({});
                setAlertFilters({});
              }}
            />
            <SecurityEvidenceTable
              view={view}
              alerts={alerts}
              events={events}
              canReview={canReview}
            />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

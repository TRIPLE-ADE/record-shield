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

export function SecurityDashboard({ context }: { context: SessionContext }) {
  const streamId = context.security_stream_id ?? "";
  const [view, setView] = useState<"alerts" | "events">("alerts");
  const [eventFilters, setEventFilters] = useState<SecurityEventFilters>({});
  const [alertFilters, setAlertFilters] = useState<SecurityAlertFilters>({});
  const [chainResult, setChainResult] = useState<ChainVerification>();
  const [chainUnknown, setChainUnknown] = useState(false);
  const events = useSecurityEvents(streamId || undefined, eventFilters);
  const alerts = useSecurityAlerts(streamId || undefined, alertFilters);
  const openAlerts =
    alerts.data?.items.filter((alert) => !alert.status.startsWith("RESOLVED")).length ?? 0;
  const criticalCount =
    alerts.data?.items.filter(
      (alert) => alert.severity === "CRITICAL" && !alert.status.startsWith("RESOLVED"),
    ).length ?? 0;
  const sourceName = context.role === "TRUST_OPERATOR" ? undefined : context.organization?.name;

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
          chainStatus={
            chainResult
              ? chainResult.status === "VALID"
                ? "valid"
                : "invalid"
              : chainUnknown
                ? "unknown"
                : "idle"
          }
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
                onClick={() => setView("alerts")}
              >
                Alert queue
              </Button>
              <Button
                variant={view === "events" ? "secondary" : "ghost"}
                size="sm"
                role="tab"
                aria-selected={view === "events"}
                onClick={() => setView("events")}
              >
                Event stream
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">Stream {streamId.slice(0, 8)}…</span>
          </CardContent>
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
            {view === "alerts" ? (
              <SecurityAlertTable
                alerts={alerts.data?.items ?? []}
                canReview={context.role === "SECURITY_ADMIN" || context.role === "TRUST_OPERATOR"}
              />
            ) : (
              <SecurityEventTable events={events.data?.items ?? []} />
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

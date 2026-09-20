"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  FingerprintIcon,
  ShieldCheckIcon,
  StackIcon,
  UsersThreeIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { workspaceDashboardQuery } from "./api";
import { AlertReviewPanel } from "../design-system/components/alert-review-panel";
import { AuditTimeline } from "../design-system/components/audit-timeline";
import { ClinicalRecordCard } from "../design-system/components/clinical-record-card";
import { ConfirmDisclosureDialog } from "../design-system/components/confirm-disclosure-dialog";
import { DataState } from "../design-system/components/data-state";
import { EmergencyBanner } from "../design-system/components/emergency-banner";
import { IntegrityIndicator } from "../design-system/components/integrity-indicator";
import { ScopeSelector } from "../design-system/components/scope-selector";
import { StatusBadge } from "../design-system/components/status-badge";
import type { WorkspaceDashboard, WorkspaceStateKind } from "@/lib/api/contracts/workspace";

const metricIcons: Record<WorkspaceDashboard["metrics"][number]["icon"], Icon> = {
  stack: StackIcon,
  "shield-check": ShieldCheckIcon,
  "users-three": UsersThreeIcon,
  "warning-circle": WarningCircleIcon,
};

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: Omit<WorkspaceDashboard["metrics"][number], "icon"> & { icon: Icon }) {
  const iconClass =
    tone === "warning"
      ? "bg-warning/15 text-warning-foreground"
      : tone === "emergency"
        ? "bg-emergency/12 text-emergency"
        : "bg-primary/12 text-primary";

  return (
    <Card size="sm" className="border-border/75 bg-card/75 shadow-none">
      <CardContent className="flex items-start gap-3 pt-4">
        <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${iconClass}`}>
          <Icon aria-hidden="true" className="size-4" weight="duotone" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 font-heading text-xl font-semibold tracking-tight">{value}</p>
          <p className="mt-0.5 truncate text-[0.68rem] text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingWorkspace() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-12 max-w-xl animate-pulse rounded-lg bg-muted" />
          <div className="h-16 max-w-2xl animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="h-36 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-128 animate-pulse rounded-xl bg-muted" />
        <div className="h-128 animate-pulse rounded-xl bg-muted" />
      </div>
    </main>
  );
}

function WorkspaceError({ onRetry }: { onRetry: () => void }) {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-[60vh] w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-10"
    >
      <DataState
        className="w-full"
        kind="unavailable"
        title="The workspace could not load"
        description="RecordShield could not retrieve the current workspace context. Try again before making a disclosure decision."
        action={
          <Button type="button" variant="outline" onClick={onRetry}>
            <ArrowsClockwiseIcon aria-hidden="true" />
            Try again
          </Button>
        }
      />
    </main>
  );
}

export default function HomePage() {
  const dashboardQuery = useQuery(workspaceDashboardQuery);
  const dashboard = dashboardQuery.data;
  const [selectedDomains, setSelectedDomains] = useState<string[] | null>(null);
  const [stateKind, setStateKind] = useState<WorkspaceStateKind | null>(null);
  const [integrityState, setIntegrityState] = useState<"verified" | "unknown" | "invalid" | null>(
    null,
  );
  const [alertReviewed, setAlertReviewed] = useState<boolean | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (dashboardQuery.isError) {
    return (
      <AppShell>
        <WorkspaceError onRetry={() => void dashboardQuery.refetch()} />
      </AppShell>
    );
  }

  if (dashboardQuery.isPending || !dashboard) {
    return (
      <AppShell>
        <LoadingWorkspace />
      </AppShell>
    );
  }

  const loadedDashboard = dashboard;

  const activeDomains = selectedDomains ?? dashboard.scope.defaultSelected;
  const activeStateKind = stateKind ?? dashboard.states.default;
  const activeState =
    dashboard.states.options.find((option) => option.kind === activeStateKind) ??
    dashboard.states.options[0];
  if (!activeState) return null;
  const activeIntegrityState = integrityState ?? dashboard.audit.integrity.default;
  const activeAlertReviewed = alertReviewed ?? dashboard.alert.reviewed;

  function resetWorkspace() {
    setSelectedDomains(null);
    setStateKind(null);
    setIntegrityState(null);
    setAlertReviewed(null);
    setNotice(loadedDashboard.hero.notice);
  }

  function confirmDisclosure() {
    setDialogOpen(false);
    setNotice("Restricted scope request staged for patient approval.");
  }

  return (
    <AppShell context={dashboard.context}>
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-10"
      >
        <section
          id="overview"
          className="grid gap-8 border-b border-border/70 pb-9 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-end"
        >
          <div className="max-w-3xl space-y-5">
            <StatusBadge tone="info" icon={ShieldCheckIcon}>
              {dashboard.hero.eyebrow}
            </StatusBadge>
            <div className="space-y-3">
              <h1 className="max-w-2xl font-heading text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl lg:text-[3.25rem] lg:leading-[1.05]">
                {dashboard.hero.title}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                {dashboard.hero.description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href="#workspace">
                  Open review workspace <ArrowUpRightIcon aria-hidden="true" />
                </a>
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={resetWorkspace}>
                <ArrowsClockwiseIcon aria-hidden="true" />
                Reset view
              </Button>
              <Link
                href="/design-system"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                View design system
                <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
              </Link>
            </div>
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {notice ?? dashboard.hero.notice}
            </p>
          </div>

          <Card className="border-primary/20 bg-primary/[0.035] shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Current shift
                  </p>
                  <CardTitle className="mt-1 text-base">{dashboard.context.user.name}</CardTitle>
                </div>
                <FingerprintIcon
                  aria-hidden="true"
                  className="size-5 text-primary"
                  weight="duotone"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Role</span>
                <span className="text-right font-medium">{dashboard.context.user.role}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Active contexts</span>
                <span className="font-mono text-xs font-medium">
                  {dashboard.metrics[2]?.value ?? "—"}
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        <section
          aria-label="Workspace metrics"
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {dashboard.metrics.map((metric) => (
            <MetricCard key={metric.id} {...metric} icon={metricIcons[metric.icon]} />
          ))}
        </section>

        <section
          id="workspace"
          className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(21rem,0.65fr)]"
        >
          <div className="min-w-0 space-y-5">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/70 bg-muted/15 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Record review
                  </p>
                  <CardTitle className="text-xl">Make the next decision legible</CardTitle>
                  <CardDescription>
                    Review source context and requested scope before a disclosure is staged.
                  </CardDescription>
                </div>
                <fieldset className="flex flex-wrap gap-1 rounded-lg bg-background p-1 ring-1 ring-border/80">
                  <legend className="sr-only">Choose a data state</legend>
                  {dashboard.states.options.map((option) => (
                    <Button
                      key={option.kind}
                      type="button"
                      variant={activeStateKind === option.kind ? "secondary" : "ghost"}
                      size="sm"
                      aria-pressed={activeStateKind === option.kind}
                      onClick={() => setStateKind(option.kind)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </fieldset>
              </CardHeader>
              <CardContent className="space-y-5 pt-5">
                <DataState
                  kind={activeState.kind}
                  title={activeState.title}
                  description={activeState.description}
                />
                <div className="grid gap-5 lg:grid-cols-2">
                  <ClinicalRecordCard
                    domain={dashboard.record.domain}
                    title={dashboard.record.title}
                    summary={dashboard.record.summary}
                    sensitivity={dashboard.record.sensitivity}
                    source={dashboard.record.provenance.source}
                    recordId={dashboard.record.provenance.recordId}
                    version={dashboard.record.provenance.version}
                    observedAt={dashboard.record.provenance.observedAt}
                    retrievedAt={dashboard.record.provenance.retrievedAt}
                  >
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/55 px-3 py-2.5 text-sm">
                      <span className="text-muted-foreground">
                        {dashboard.record.reactionLabel}
                      </span>
                      <span className="font-medium text-foreground">
                        {dashboard.record.reactionValue}
                      </span>
                    </div>
                  </ClinicalRecordCard>
                  <Card id="scope" className="h-full border-primary/20 bg-primary/2.5">
                    <CardHeader>
                      <CardTitle className="text-base">Scope before disclosure</CardTitle>
                      <CardDescription>
                        A named purpose and exact domains keep the request reviewable.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ScopeSelector
                        options={dashboard.scope.options}
                        selected={activeDomains}
                        onChange={setSelectedDomains}
                      />
                      <Button
                        type="button"
                        className="w-full"
                        disabled={activeDomains.length === 0}
                        onClick={() =>
                          setNotice(
                            `${activeDomains.length} domain${activeDomains.length === 1 ? "" : "s"} staged for patient approval.`,
                          )
                        }
                      >
                        Request selected access
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            <Card id="security">
              <CardHeader className="border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">Evidence for the decision</CardTitle>
                  <CardDescription>
                    Metadata explains the exchange without copying clinical payloads.
                  </CardDescription>
                </div>
                <StatusBadge tone="success" icon={FingerprintIcon}>
                  Metadata only
                </StatusBadge>
              </CardHeader>
              <CardContent className="grid gap-6 pt-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Recent activity</p>
                      <p className="text-xs text-muted-foreground">
                        Correlation IDs stay visible at the edge.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setNotice(
                          `Audit stream refreshed at ${dashboard.record.provenance.retrievedAt}.`,
                        )
                      }
                    >
                      <ArrowsClockwiseIcon aria-hidden="true" />
                      Refresh
                    </Button>
                  </div>
                  <AuditTimeline events={dashboard.audit.events} />
                </div>
                <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{dashboard.audit.stream} stream</p>
                      <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground">
                        head {dashboard.audit.head}
                      </p>
                    </div>
                    <StatusBadge tone="info">Hash chain</StatusBadge>
                  </div>
                  <IntegrityIndicator
                    state={activeIntegrityState}
                    descriptions={dashboard.audit.integrity.description}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIntegrityState("verified")}
                    >
                      <CheckCircleIcon aria-hidden="true" />
                      Verify chain
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIntegrityState("invalid")}
                    >
                      Simulate failure
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="min-w-0 space-y-5">
            <div id="emergency">
              <EmergencyBanner
                emergency={dashboard.emergency}
                onExpand={() => setDialogOpen(true)}
              />
            </div>
            <AlertReviewPanel
              alert={dashboard.alert}
              reviewed={activeAlertReviewed}
              onReview={() => {
                setAlertReviewed(true);
                setNotice("Alert review recorded with reviewer context.");
              }}
            />
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base">Operator notes</CardTitle>
                    <CardDescription>
                      Keep context visible while a decision is open.
                    </CardDescription>
                  </div>
                  <StatusBadge tone="success" icon={CheckCircleIcon}>
                    Ready
                  </StatusBadge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>{dashboard.hero.notice}</p>
                <Link
                  href="/design-system"
                  className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                >
                  Review interface patterns
                  <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
                </Link>
              </CardContent>
            </Card>
          </aside>
        </section>
      </main>

      <ConfirmDisclosureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={confirmDisclosure}
      />
    </AppShell>
  );
}

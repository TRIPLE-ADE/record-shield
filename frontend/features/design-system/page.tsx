"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowsClockwise,
  Check,
  CheckCircle,
  Clock,
  Fingerprint,
  ShieldCheck,
  Sparkle,
  Stack,
} from "@phosphor-icons/react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertReviewPanel } from "./components/alert-review-panel";
import { AuditTimeline } from "./components/audit-timeline";
import { ClinicalRecordCard } from "./components/clinical-record-card";
import { ConfirmDisclosureDialog } from "./components/confirm-disclosure-dialog";
import { DataState } from "./components/data-state";
import { EmergencyBanner } from "./components/emergency-banner";
import { IntegrityIndicator, type IntegrityState } from "./components/integrity-indicator";
import { ScopeSelector } from "./components/scope-selector";
import { SensitivityBadge } from "./components/sensitivity-badge";
import { StatusBadge } from "./components/status-badge";

type PreviewStateKind = "ready" | "empty" | "denied" | "unavailable" | "expired";
type PreviewContext = {
  hospital: string;
  environment: string;
  connection: "online" | "offline";
  user: { initials: string; name: string; role: string };
};
type PreviewState = {
  kind: PreviewStateKind;
  label: string;
  title: string;
  description: string;
};
type PreviewAuditEvent = {
  id: string;
  time: string;
  title: string;
  detail: string;
  kind: "emergency" | "success" | "critical";
};
type PreviewEmergency = {
  level: string;
  patient: string;
  source: string;
  description: string;
  expiresIn: string;
  progress: number;
  reviewDue: string;
  purpose: string;
};
type PreviewAlert = {
  title: string;
  severity: string;
  description: string;
  age: string;
  reviewed: boolean;
};

const previewContext: PreviewContext = {
  hospital: "Unity Medical",
  environment: "Preview",
  connection: "online",
  user: {
    initials: "DS",
    name: "Design review",
    role: "Product team",
  },
};

const previewStates: PreviewState[] = [
  {
    kind: "ready",
    label: "Ready",
    title: "Source is responding",
    description: "The authorized projection is ready to review with source metadata attached.",
  },
  {
    kind: "empty",
    label: "No records",
    title: "No eligible records",
    description: "The source returned no releasable records for this scope.",
  },
  {
    kind: "denied",
    label: "Denied",
    title: "This scope is not available",
    description: "The current role does not permit this domain. No clinical payload was returned.",
  },
  {
    kind: "unavailable",
    label: "Unavailable",
    title: "Source is offline",
    description: "RecordShield will not show stale clinical data while the source is unavailable.",
  },
  {
    kind: "expired",
    label: "Expired",
    title: "The access window ended",
    description: "Request a new scope if treatment still requires this information.",
  },
];

const previewScope = [
  {
    id: "allergies",
    label: "Allergies",
    description: "Known reactions and severity",
    sensitivity: "sensitive" as const,
  },
  {
    id: "medications",
    label: "Medications",
    description: "Active and recently stopped",
    sensitivity: "sensitive" as const,
  },
  {
    id: "hiv",
    label: "HIV status",
    description: "Explicit restricted domain",
    sensitivity: "restricted" as const,
  },
];

const previewEvents: PreviewAuditEvent[] = [
  {
    id: "preview-1",
    time: "09:42",
    title: "Emergency summary released",
    detail: "Reviewer context attached",
    kind: "emergency",
  },
  {
    id: "preview-2",
    time: "09:41",
    title: "Consent scope approved",
    detail: "Three domains · patient approval",
    kind: "success",
  },
  {
    id: "preview-3",
    time: "09:38",
    title: "Request denied by policy",
    detail: "Restricted domain · audit recorded",
    kind: "critical",
  },
];

const previewEmergency: PreviewEmergency = {
  level: "Level 1",
  patient: "Musa Ibrahim",
  source: "Mercy General source",
  description:
    "Minimum necessary emergency data is available to support immediate treatment. Absence is not proof of absence.",
  expiresIn: "12m 48s",
  progress: 34,
  reviewDue: "4 minutes",
  purpose: "treatment context",
};

const previewAlert: PreviewAlert = {
  title: "Repeated denied access",
  severity: "High",
  description: "5 denials in 5 minutes · actor context is available to security reviewers only.",
  age: "4 minutes ago",
  reviewed: false,
};

const previewRecord = {
  domain: "Allergies",
  title: "Penicillin sensitivity",
  summary:
    "Rash documented after amoxicillin. The source observation is preserved without inferring a new diagnosis.",
  sensitivity: "sensitive" as const,
  source: "Mercy General",
  recordId: "PAT-00291 / ALG-004",
  version: "Revision 3",
  observedAt: "18 Sep 2026, 14:20",
  retrievedAt: "09:42 UTC",
};

const integrityDescriptions = {
  verified: "Hash links match the checkpoint",
  unknown: "Verification has not run yet",
  invalid: "Sequence 18 does not match",
};

function TokenSwatch({
  label,
  variable,
  className,
}: {
  label: string;
  variable: string;
  className: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`size-7 rounded-lg ring-1 ring-black/8 ${className}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="truncate font-mono text-[0.65rem] text-muted-foreground">{variable}</p>
      </div>
    </div>
  );
}

function ChecklistItem({
  label,
  detail,
  complete,
}: {
  label: string;
  detail: string;
  complete: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={
          complete
            ? "grid size-5 shrink-0 place-items-center rounded-full bg-success/12 text-success"
            : "grid size-5 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
        }
      >
        {complete ? (
          <Check aria-hidden="true" className="size-3" weight="bold" />
        ) : (
          <span className="size-1.5 rounded-full bg-current" />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

export default function DesignSystemPage() {
  const [selectedDomains, setSelectedDomains] = useState(["allergies", "medications"]);
  const [stateKind, setStateKind] = useState<PreviewStateKind>("ready");
  const [integrityState, setIntegrityState] = useState<IntegrityState>("verified");
  const [alertReviewed, setAlertReviewed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState("Preview ready for review.");
  const activeState = previewStates.find((state) => state.kind === stateKind) ?? previewStates[0];

  function resetPreview() {
    setSelectedDomains(["allergies", "medications"]);
    setStateKind("ready");
    setIntegrityState("verified");
    setAlertReviewed(false);
    setNotice("Preview ready for review.");
  }

  function confirmDisclosure() {
    setDialogOpen(false);
    setNotice("Restricted scope request staged for patient approval.");
  }

  if (!activeState) return null;

  return (
    <AppShell context={previewContext} variant="design-system">
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-10"
      >
        <section
          id="overview"
          className="grid gap-8 border-b border-border/70 pb-9 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end"
        >
          <div className="max-w-3xl space-y-5">
            <StatusBadge tone="info" icon={Sparkle}>
              Design system
            </StatusBadge>
            <div className="space-y-3">
              <h1 className="max-w-2xl font-heading text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl lg:text-[3.25rem] lg:leading-[1.05]">
                A quiet system for high-stakes decisions.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Shared patterns make every disclosure legible: who is acting, what is in scope,
                where a record came from, and when access ends.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href="#patterns">
                  Review patterns <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={resetPreview}>
                <ArrowsClockwise aria-hidden="true" />
                Reset preview
              </Button>
              <Link
                href="/"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Return to workspace <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </Link>
            </div>
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {notice}
            </p>
          </div>

          <Card id="foundations" className="shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Foundations
                  </p>
                  <CardTitle className="mt-1 text-base">Trust, clarity, restraint</CardTitle>
                </div>
                <Stack aria-hidden="true" className="size-5 text-primary" weight="duotone" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="grid grid-cols-2 gap-4">
                <TokenSwatch label="Primary" variable="--primary" className="bg-primary" />
                <TokenSwatch label="Success" variable="--success" className="bg-success" />
                <TokenSwatch
                  label="Sensitive"
                  variable="--sensitivity-sensitive"
                  className="bg-sensitivity-sensitive"
                />
                <TokenSwatch label="Emergency" variable="--emergency" className="bg-emergency" />
              </div>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <SensitivityBadge level="standard" />
                <SensitivityBadge level="sensitive" />
                <SensitivityBadge level="restricted" />
              </div>
            </CardContent>
          </Card>
        </section>

        <section
          id="states"
          className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(21rem,0.65fr)]"
        >
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-muted/15 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  States
                </p>
                <CardTitle className="text-xl">Safety states are part of the product</CardTitle>
                <CardDescription>
                  Use the same language when data is ready, blocked, stale, or outside scope.
                </CardDescription>
              </div>
              <fieldset className="flex flex-wrap gap-1 rounded-lg bg-background p-1 ring-1 ring-border/80">
                <legend className="sr-only">Choose a data state</legend>
                {previewStates.map((option) => (
                  <Button
                    key={option.kind}
                    type="button"
                    variant={stateKind === option.kind ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={stateKind === option.kind}
                    onClick={() => setStateKind(option.kind)}
                  >
                    {option.label}
                  </Button>
                ))}
              </fieldset>
            </CardHeader>
            <CardContent className="pt-5">
              <DataState
                kind={activeState.kind}
                title={activeState.title}
                description={activeState.description}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck aria-hidden="true" className="size-4" weight="duotone" />
                </div>
                <div>
                  <CardTitle className="text-base">Review language</CardTitle>
                  <CardDescription>Each state has a clear next step.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                <ChecklistItem
                  label="Text explains the state"
                  detail="No color-only meaning"
                  complete
                />
                <ChecklistItem
                  label="Focus remains visible"
                  detail="Keyboard-first interactions"
                  complete
                />
                <ChecklistItem
                  label="Sensitive scope is explicit"
                  detail="Purpose before disclosure"
                  complete
                />
              </ul>
            </CardContent>
          </Card>
        </section>

        <section id="patterns" className="mt-5 grid gap-5 lg:grid-cols-2">
          <ClinicalRecordCard {...previewRecord}>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/55 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">Reaction</span>
              <span className="font-medium text-foreground">Rash · moderate</span>
            </div>
          </ClinicalRecordCard>
          <Card className="border-primary/20 bg-primary/2.5">
            <CardHeader>
              <CardTitle className="text-base">Scope before disclosure</CardTitle>
              <CardDescription>
                A named purpose and exact domains keep a request reviewable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScopeSelector
                options={previewScope}
                selected={selectedDomains}
                onChange={setSelectedDomains}
              />
              <Button
                type="button"
                className="w-full"
                disabled={selectedDomains.length === 0}
                onClick={() => setNotice(`${selectedDomains.length} domains staged for review.`)}
              >
                Request selected access
              </Button>
            </CardContent>
          </Card>
        </section>

        <section
          id="security"
          className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]"
        >
          <Card>
            <CardHeader className="border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg">Evidence for the decision</CardTitle>
                <CardDescription>
                  Audit metadata stays readable without exposing a payload.
                </CardDescription>
              </div>
              <StatusBadge tone="success" icon={Fingerprint}>
                Metadata only
              </StatusBadge>
            </CardHeader>
            <CardContent className="grid gap-6 pt-5 lg:grid-cols-[1.1fr_0.9fr]">
              <AuditTimeline events={previewEvents} />
              <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Exchange stream</p>
                    <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground">
                      head 00281
                    </p>
                  </div>
                  <StatusBadge tone="info">Hash chain</StatusBadge>
                </div>
                <IntegrityIndicator state={integrityState} descriptions={integrityDescriptions} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIntegrityState("verified")}
                  >
                    <CheckCircle aria-hidden="true" /> Verify chain
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

          <div id="emergency" className="space-y-5">
            <EmergencyBanner emergency={previewEmergency} onExpand={() => setDialogOpen(true)} />
            <AlertReviewPanel
              alert={previewAlert}
              reviewed={alertReviewed}
              onReview={() => {
                setAlertReviewed(true);
                setNotice("Alert review recorded with reviewer context.");
              }}
            />
          </div>
        </section>

        <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock aria-hidden="true" className="size-3.5 text-primary" weight="duotone" />
          Preview components are representative states only; product data is loaded by the workspace
          route.
        </div>
      </main>

      <ConfirmDisclosureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={confirmDisclosure}
      />
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { useWatch } from "react-hook-form";
import {
  ArrowUpRightIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  FingerprintIcon,
  ShieldCheckIcon,
  SparkleIcon,
  StackIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertReviewPanel } from "./components/alert-review-panel";
import { AuditTimeline } from "./components/audit-timeline";
import { ClinicalRecordCard } from "./components/clinical-record-card";
import { ConfirmDisclosureDialog } from "./components/confirm-disclosure-dialog";
import { DataState } from "./components/data-state";
import { EmergencyBanner } from "./components/emergency-banner";
import { IntegrityIndicator } from "./components/integrity-indicator";
import { ScopeSelector } from "./components/scope-selector";
import { SensitivityBadge } from "./components/sensitivity-badge";
import { StatusBadge } from "./components/status-badge";
import { useDesignSystemPreview, DesignSystemPreviewProvider } from "./preview-context";
import {
  integrityDescriptions,
  previewAlert,
  previewEmergency,
  previewEvents,
  previewRecord,
  previewScope,
  previewStates,
} from "./preview-data";

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

function ChecklistItem({ label, detail }: { label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success/12 text-success">
        <CheckIcon aria-hidden="true" className="size-3" weight="bold" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

function StatePicker() {
  const { form } = useDesignSystemPreview();
  const state = useWatch({ control: form.control, name: "state" }) ?? "ready";

  return (
    <fieldset className="flex flex-wrap gap-1 rounded-lg bg-background p-1 ring-1 ring-border/80">
      <legend className="sr-only">Choose a data state</legend>
      {previewStates.map((option) => (
        <Button
          key={option.kind}
          type="button"
          variant={state === option.kind ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={state === option.kind}
          onClick={() => form.setValue("state", option.kind, { shouldDirty: true })}
        >
          {option.label}
        </Button>
      ))}
    </fieldset>
  );
}

function IntegrityControls() {
  const { form } = useDesignSystemPreview();
  const integrity = useWatch({ control: form.control, name: "integrity" }) ?? "verified";

  return (
    <>
      <IntegrityIndicator state={integrity} descriptions={integrityDescriptions} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => form.setValue("integrity", "verified", { shouldDirty: true })}
        >
          <CheckCircleIcon aria-hidden="true" /> Verify chain
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => form.setValue("integrity", "invalid", { shouldDirty: true })}
        >
          Simulate failure
        </Button>
      </div>
    </>
  );
}

function DesignSystemContent() {
  const {
    form,
    alertReviewed,
    dialogOpen,
    notice,
    resetPreview,
    setNotice,
    markAlertReviewed,
    openDisclosure,
    closeDisclosure,
    confirmDisclosure,
  } = useDesignSystemPreview();
  const state = useWatch({ control: form.control, name: "state" }) ?? "ready";
  const selectedDomains = useWatch({ control: form.control, name: "domains" }) ?? [];
  const activeState = previewStates.find((option) => option.kind === state) ?? previewStates[0];

  return (
    <>
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-10"
      >
        <section
          id="overview"
          className="grid gap-8 border-b border-border/70 pb-9 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end"
        >
          <div className="max-w-3xl space-y-5">
            <StatusBadge tone="info" icon={SparkleIcon}>
              Design system
            </StatusBadge>
            <div className="space-y-3">
              <h1 className="max-w-2xl font-heading text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl lg:text-[3.25rem] lg:leading-[1.05]">
                Small parts. Clear states.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                One reference page for the tokens, primitives, and composed patterns that make
                sensitive decisions legible and consistent.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href="#components">
                  Review components <ArrowUpRightIcon aria-hidden="true" />
                </a>
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={resetPreview}>
                <ArrowsClockwiseIcon aria-hidden="true" /> Reset preview
              </Button>
              <Link
                href="/"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Return home <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
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
                <StackIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
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

        <section id="components" className="mt-8 grid gap-5 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Buttons</CardTitle>
              <CardDescription>
                Actions communicate priority without competing for attention.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button type="button">Primary</Button>
              <Button type="button" variant="outline">
                Outline
              </Button>
              <Button type="button" variant="ghost">
                Quiet
              </Button>
              <Button type="button" variant="destructive">
                Destructive
              </Button>
              <Button type="button" disabled>
                Disabled
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status language</CardTitle>
              <CardDescription>
                Color supports the label; it never carries meaning alone.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <StatusBadge tone="success">Verified</StatusBadge>
              <StatusBadge tone="info">In review</StatusBadge>
              <StatusBadge tone="warning">Needs attention</StatusBadge>
              <StatusBadge tone="critical">Denied</StatusBadge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Form controls</CardTitle>
              <CardDescription>
                Labels and focus states keep a decision understandable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="component-reference-input">Reference input</Label>
              <Input id="component-reference-input" placeholder="Search by record ID" />
            </CardContent>
          </Card>
        </section>

        <section
          id="states"
          className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(21rem,0.65fr)]"
        >
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-muted/15 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  States
                </p>
                <CardTitle className="text-xl">Every state has a next step</CardTitle>
                <CardDescription>
                  Ready, empty, denied, unavailable, and expired states use the same clear language.
                </CardDescription>
              </div>
              <StatePicker />
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
                  <ShieldCheckIcon aria-hidden="true" className="size-4" weight="duotone" />
                </div>
                <div>
                  <CardTitle className="text-base">State contract</CardTitle>
                  <CardDescription>
                    Shared behavior keeps the interface predictable.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                <ChecklistItem
                  label="Explain the state in text"
                  detail="Never rely on color alone"
                />
                <ChecklistItem label="Keep focus visible" detail="Keyboard-first interactions" />
                <ChecklistItem label="Name sensitive scope" detail="Purpose before disclosure" />
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
              <ScopeSelector options={previewScope} />
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
                <CardTitle className="text-lg">Evidence pattern</CardTitle>
                <CardDescription>
                  Metadata stays readable without exposing a payload.
                </CardDescription>
              </div>
              <StatusBadge tone="success" icon={FingerprintIcon}>
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
                <IntegrityControls />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <EmergencyBanner emergency={previewEmergency} onExpand={openDisclosure} />
            <AlertReviewPanel
              alert={{ ...previewAlert, reviewed: alertReviewed }}
              reviewed={alertReviewed}
              onReview={markAlertReviewed}
            />
          </div>
        </section>

        <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <ClockIcon aria-hidden="true" className="size-3.5 text-primary" weight="duotone" />
          Representative examples only; contract-backed product features will consume these patterns
          later.
        </div>
      </main>

      <ConfirmDisclosureDialog
        open={dialogOpen}
        onOpenChange={closeDisclosure}
        onConfirm={confirmDisclosure}
      />
    </>
  );
}

export default function DesignSystemPage() {
  return (
    <DesignSystemPreviewProvider>
      <DesignSystemContent />
    </DesignSystemPreviewProvider>
  );
}

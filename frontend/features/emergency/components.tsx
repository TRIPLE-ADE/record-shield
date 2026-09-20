"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  InfoIcon,
  LockKeyIcon,
  ShieldCheckIcon,
  SirenIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ApiError } from "@/lib/api/client";
import {
  emergencyActivateSchema,
  emergencyExpansionSchema,
  emergencyJustificationCreateSchema,
  type EmergencyActivate,
  type EmergencyDomain,
  type EmergencySession,
  type EmergencySummary,
} from "@/lib/api/contracts/emergency";
import type { SessionContext } from "@/lib/api/contracts/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useActivateEmergency,
  useEmergencyRecords,
  useEmergencyStatus,
  useExpandEmergency,
  useSubmitEmergencyJustification,
} from "./api";

const reasonOptions: Array<{ value: EmergencyActivate["reason_code"]; label: string }> = [
  { value: "UNCONSCIOUS", label: "Patient is unconscious" },
  { value: "INCAPACITATED", label: "Patient is incapacitated" },
  { value: "IMMEDIATE_THREAT", label: "Immediate threat to life or health" },
];

const domainOptions: Array<{
  value: EmergencyDomain;
  label: string;
  description: string;
  restricted?: boolean;
}> = [
  { value: "history", label: "History", description: "Relevant history recorded by the source" },
  { value: "vitals", label: "Vitals", description: "Recent observations and measurements" },
  { value: "diagnoses", label: "Diagnoses", description: "Major diagnoses and active status" },
  {
    value: "medications",
    label: "Medications",
    description: "Medication orders and active status",
  },
  { value: "allergies", label: "Allergies", description: "Known reactions and sensitivities" },
  {
    value: "investigations",
    label: "Investigations",
    description: "Selected laboratory and imaging results",
  },
  {
    value: "nursing_notes",
    label: "Nursing notes",
    description: "Not enabled by the current source policy",
    restricted: true,
  },
  {
    value: "physiotherapy_notes",
    label: "Physiotherapy notes",
    description: "Not enabled by the current source policy",
    restricted: true,
  },
  {
    value: "mental_health",
    label: "Mental health",
    description: "Restricted by the current source policy",
    restricted: true,
  },
  {
    value: "hiv",
    label: "HIV",
    description: "Restricted by the current source policy",
    restricted: true,
  },
  {
    value: "genetic",
    label: "Genetic",
    description: "Restricted by the current source policy",
    restricted: true,
  },
];

const sectionMeta: Array<{ key: keyof EmergencySummary; label: string }> = [
  { key: "blood_group", label: "Blood group" },
  { key: "allergies", label: "Allergies" },
  { key: "active_medications", label: "Active medications" },
  { key: "critical_conditions", label: "Critical conditions" },
  { key: "major_diagnoses", label: "Major diagnoses" },
  { key: "major_procedures", label: "Major procedures" },
  { key: "recent_investigations", label: "Recent investigations" },
  { key: "critical_alerts", label: "Critical alerts" },
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const activationFormSchema = emergencyActivateSchema.extend({
  necessity_confirmed: z.boolean().refine(Boolean, "Confirm necessity before activating."),
});

type EmergencyWorkspaceProps = {
  patientId: string;
  patientName?: string;
  organizationName: string;
  encounterId: string;
  sessionContext: SessionContext & { organization: NonNullable<SessionContext["organization"]> };
  sources: Array<{
    organization: { organization_id: string; name: string; mode: "MOCK_EMR" | "LITE" };
  }>;
};

type EmergencyActivateFormValues = z.input<typeof activationFormSchema>;

export function EmergencyWorkspace({
  patientId,
  patientName,
  organizationName,
  encounterId,
  sessionContext,
  sources,
}: EmergencyWorkspaceProps) {
  const [sessionId, setSessionId] = useState("");
  if (sessionId) {
    return (
      <ActiveEmergencySession
        patientId={patientId}
        patientName={patientName}
        organizationName={organizationName}
        sessionId={sessionId}
        onReset={() => setSessionId("")}
      />
    );
  }
  return (
    <EmergencyActivation
      patientId={patientId}
      patientName={patientName}
      organizationName={organizationName}
      encounterId={encounterId}
      sessionContext={sessionContext}
      sources={sources}
      onActivated={setSessionId}
    />
  );
}

function EmergencyActivation({
  patientId,
  patientName,
  organizationName,
  encounterId,
  sessionContext,
  sources,
  onActivated,
}: EmergencyWorkspaceProps & { onActivated: (sessionId: string) => void }) {
  const selectedSourceId = sources[0]?.organization.organization_id ?? "";
  const activate = useActivateEmergency();
  const activationForm = useForm<EmergencyActivateFormValues>({
    resolver: zodResolver(activationFormSchema),
    defaultValues: {
      patient_id: patientId,
      source_org_id: selectedSourceId,
      receiving_encounter_id: encounterId,
      reason_code: "IMMEDIATE_THREAT",
      necessity_confirmed: false,
    },
    mode: "onChange",
  });
  const necessityConfirmed = useWatch({
    control: activationForm.control,
    name: "necessity_confirmed",
  });

  function submitActivation(values: EmergencyActivateFormValues) {
    const input = emergencyActivateSchema.parse({
      ...values,
      necessity_confirmed: true,
      patient_id: patientId,
      source_org_id: values.source_org_id || selectedSourceId,
      receiving_encounter_id: encounterId,
    });
    activate.mutate(input, {
      onSuccess: (result) => {
        onActivated(result.session.id);
        toast.success("Emergency summary activated");
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  }

  return (
    <ActivationView
      patientId={patientId}
      patientName={patientName}
      organizationName={organizationName}
      encounterId={encounterId}
      sources={sources}
      sessionContext={sessionContext}
      form={activationForm}
      necessityConfirmed={Boolean(necessityConfirmed)}
      isSubmitting={activate.isPending}
      onSubmit={submitActivation}
    />
  );
}

function ActiveEmergencySession({
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
  if (statusError && !(statusError instanceof ApiError && statusError.status === 403)) {
    return (
      <EmergencyPageFrame patientId={patientId}>
        <EmergencyState
          icon={<WarningIcon aria-hidden="true" className="size-5" />}
          title="Emergency session unavailable"
          description={errorMessage(statusError)}
          action={
            <Button type="button" variant="outline" onClick={onReset}>
              Start a new session
            </Button>
          }
        />
      </EmergencyPageFrame>
    );
  }

  const summaryData = summary.data?.view === "summary" ? summary.data.summary : undefined;
  const expandedData = expanded.data?.view === "expanded" ? expanded.data.records : undefined;
  return (
    <EmergencyPageFrame patientId={patientId}>
      <div className="space-y-6">
        <EmergencyHeader
          patientName={patientName ?? summaryData?.patient.name}
          organizationName={organizationName}
          session={currentSession}
        />
        {currentSession ? <SessionNotice session={currentSession} /> : null}
        {summary.isPending ? <SummarySkeleton /> : null}
        {summaryData ? <SummaryGrid summary={summaryData} /> : null}
        {summary.error ? <InlineError error={summary.error} /> : null}
        {currentSession && isSessionActive(currentSession) ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <ExpandedRecords records={expandedData} isLoading={expanded.isPending} />
            <div className="space-y-6">
              <ExpansionCard
                session={currentSession}
                open={expansionOpen}
                onOpenChange={setExpansionOpen}
                expandedDomains={activeDomains}
                isSubmitting={false}
                onExpanded={(nextDomains) => {
                  setExpandedDomains(nextDomains);
                  setExpansionOpen(false);
                }}
              />
              <JustificationCard session={currentSession} />
            </div>
          </div>
        ) : null}
        {currentSession?.status === "EXPIRED" || currentSession?.status === "REVOKED" ? (
          <EmergencyState
            icon={<ClockIcon aria-hidden="true" className="size-5" />}
            title={`Session ${currentSession.status === "EXPIRED" ? "expired" : "revoked"}`}
            description="Protected reads are no longer available. A new session requires a fresh necessity confirmation."
            action={
              <Button type="button" variant="outline" onClick={onReset}>
                Start a new session
              </Button>
            }
          />
        ) : null}
      </div>
    </EmergencyPageFrame>
  );
}

function ActivationView({
  patientId,
  patientName,
  organizationName,
  encounterId,
  sources,
  sessionContext,
  form,
  necessityConfirmed,
  isSubmitting,
  onSubmit,
}: {
  patientId: string;
  patientName?: string;
  organizationName: string;
  encounterId: string;
  sources: EmergencyWorkspaceProps["sources"];
  sessionContext: EmergencyWorkspaceProps["sessionContext"];
  form: ReturnType<typeof useForm<EmergencyActivateFormValues>>;
  necessityConfirmed: boolean;
  isSubmitting: boolean;
  onSubmit: (values: EmergencyActivateFormValues) => void;
}) {
  return (
    <EmergencyPageFrame patientId={patientId}>
      <div className="max-w-3xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emergency">
            Emergency access
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Activate a bounded patient summary
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Use the smallest safe view for the immediate decision. This session is visible to the
            patient and security team, expires after 15 minutes, and requires a clinical review.
          </p>
        </div>

        <Card className="overflow-hidden border-emergency/30 bg-emergency/3">
          <div className="h-1 bg-emergency" />
          <CardHeader className="px-5 py-5 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <SirenIcon aria-hidden="true" className="size-5 text-emergency" weight="duotone" />
              Confirm the receiving context
            </CardTitle>
            <CardDescription>
              Every field is bound to the active patient, facility, and encounter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-6 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <ContextValue label="Patient" value={patientName ?? "Patient record"} />
              <ContextValue label="Receiving facility" value={organizationName} />
              <ContextValue
                label="Encounter"
                value={encounterId ? "Open emergency encounter" : "Unavailable"}
              />
            </div>

            <form
              className="space-y-5 border-t border-emergency/15 pt-5"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <div className="space-y-2">
                <Label htmlFor="emergency-source">Source facility</Label>
                <select
                  id="emergency-source"
                  {...form.register("source_org_id")}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  <option value="">Choose a linked source</option>
                  {sources.map((source) => (
                    <option
                      key={source.organization.organization_id}
                      value={source.organization.organization_id}
                    >
                      {source.organization.name}
                    </option>
                  ))}
                </select>
                {sources.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No linked source is available for this encounter.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="emergency-reason">Reason for immediate access</Label>
                <select
                  id="emergency-reason"
                  {...form.register("reason_code")}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  {reasonOptions.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emergency/20 bg-emergency/5 p-4">
                <input
                  type="checkbox"
                  {...form.register("necessity_confirmed")}
                  className="mt-1 size-4 accent-[var(--emergency)]"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">I confirm this is necessary now</span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    I am acting within my active shift and will use only what is needed for
                    immediate treatment.
                  </span>
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emergency/15 pt-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheckIcon
                    aria-hidden="true"
                    className="size-4 text-success"
                    weight="duotone"
                  />
                  {sessionContext.user.username} · {sessionContext.role?.replaceAll("_", " ")}
                </p>
                <Button
                  type="submit"
                  disabled={!form.formState.isValid || !necessityConfirmed || isSubmitting}
                >
                  <SirenIcon aria-hidden="true" />
                  {isSubmitting ? "Activating…" : "Activate emergency summary"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </EmergencyPageFrame>
  );
}

function EmergencyHeader({
  patientName,
  organizationName,
  session,
}: {
  patientName?: string;
  organizationName: string;
  session?: EmergencySession;
}) {
  return (
    <div className="flex flex-col justify-between gap-5 border-b border-border/70 pb-6 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emergency">
          Emergency review
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          {patientName ?? "Patient summary"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {organizationName} · bounded source disclosure
        </p>
      </div>
      {session ? (
        <div className="rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-right">
          <p className="text-xs text-muted-foreground">Session level</p>
          <p className="mt-1 text-sm font-semibold">
            Level {session.level} · {formatStatus(session.status)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SessionNotice({ session }: { session: EmergencySession }) {
  const remaining = formatRemaining(session.expires_at);
  const due = formatRemaining(session.justification_due_at);
  const overdue = session.justification_status === "JUSTIFICATION_OVERDUE";
  return (
    <Card className="overflow-hidden border-emergency/30 bg-emergency/4">
      <div className="h-1 bg-emergency" />
      <CardContent className="space-y-4 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emergency/12 text-emergency">
              <SirenIcon aria-hidden="true" className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-base font-semibold">Emergency summary active</h2>
                <span className="rounded-full bg-emergency/12 px-2 py-1 text-xs font-semibold text-emergency">
                  Level {session.level}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {reasonLabel(session.reason_code)} · every read is recorded
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
            <CheckCircleIcon aria-hidden="true" className="size-4" weight="duotone" />
            Audited
          </span>
        </div>
        <div className="grid gap-3 border-t border-emergency/15 pt-4 sm:grid-cols-2">
          <TimerValue label="Session expires" value={remaining} urgent />
          <TimerValue
            label="Clinical review"
            value={overdue ? "Overdue · expansion paused" : `Due in ${due}`}
            urgent={overdue}
          />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          The summary is deliberately incomplete. An item marked unknown does not mean the condition
          is absent.
        </p>
      </CardContent>
    </Card>
  );
}

function SummaryGrid({ summary }: { summary: EmergencySummary }) {
  return (
    <section aria-labelledby="summary-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Level 1</p>
          <h2 id="summary-heading" className="mt-1 font-heading text-xl font-semibold">
            Bounded clinical summary
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Retrieved {dateFormatter.format(new Date(summary.retrieved_at))}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sectionMeta.map(({ key, label }) => {
          const section = summary[key];
          if (!isSummarySection(section)) return null;
          return (
            <Card key={key} className="min-h-32 border-border/70">
              <CardHeader className="px-4 pb-2 pt-4">
                <CardTitle className="text-sm">{label}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {section.status === "UNKNOWN" ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <InfoIcon aria-hidden="true" className="size-4" />
                    Unknown in this summary
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {section.items.map((item) => (
                      <li key={item.record_id} className="text-sm leading-5">
                        {item.text}
                        <span className="mt-1 block text-[0.68rem] text-muted-foreground">
                          Observed {dateFormatter.format(new Date(item.observed_at))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{summary.completeness_notice}</p>
    </section>
  );
}

function ExpandedRecords({
  records,
  isLoading,
}: {
  records?: {
    items: Array<{
      id: string;
      domain: string;
      subtype: string;
      recorded_at: string;
      payload: Record<string, unknown>;
    }>;
    completeness_notice: string;
  };
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="px-5 py-5 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowRightIcon aria-hidden="true" className="size-5 text-primary" />
          Level 2 records
        </CardTitle>
        <CardDescription>Only the explicitly requested domains appear here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-6 sm:px-6">
        {isLoading ? <Skeleton className="h-24 rounded-xl" /> : null}
        {!isLoading && !records ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No Level 2 domain has been requested.
          </p>
        ) : null}
        {records?.items.map((record) => (
          <div key={record.id} className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold capitalize">
                {record.domain.replaceAll("_", " ")}
              </p>
              <span className="text-xs text-muted-foreground">{record.subtype}</span>
            </div>
            <p className="mt-2 text-sm leading-6">{recordPayloadText(record.payload)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Recorded {dateFormatter.format(new Date(record.recorded_at))}
            </p>
          </div>
        ))}
        {records ? (
          <p className="text-xs leading-5 text-muted-foreground">{records.completeness_notice}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ExpansionCard({
  session,
  open,
  onOpenChange,
  expandedDomains,
  onExpanded,
}: {
  session: EmergencySession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expandedDomains: EmergencyDomain[];
  isSubmitting: boolean;
  onExpanded: (domains: EmergencyDomain[]) => void;
}) {
  const [selectedDomains, setSelectedDomains] = useState<EmergencyDomain[]>([]);
  const expand = useExpandEmergency();
  const form = useForm<z.infer<typeof emergencyExpansionSchema>>({
    resolver: zodResolver(emergencyExpansionSchema),
    defaultValues: { domains: [], narrative: "", expected_version: session.version },
    mode: "onChange",
  });
  const narrative = useWatch({ control: form.control, name: "narrative" }) ?? "";
  const selectedDomainSet = new Set(selectedDomains);
  const expandedDomainSet = new Set(expandedDomains);

  function toggleDomain(domain: EmergencyDomain) {
    const next = selectedDomains.includes(domain)
      ? selectedDomains.filter((item) => item !== domain)
      : [...selectedDomains, domain];
    setSelectedDomains(next);
    form.setValue("domains", next, { shouldValidate: true });
  }

  function submit(values: z.infer<typeof emergencyExpansionSchema>) {
    expand.mutate(
      {
        sessionId: session.id,
        input: { ...values, domains: selectedDomains, expected_version: session.version },
      },
      {
        onSuccess: (result) => {
          if (result.view === "expanded") {
            const next = result.session.expanded_domains;
            onExpanded(next);
            form.reset({ domains: [], narrative: "", expected_version: result.session.version });
            setSelectedDomains([]);
            toast.success("Level 2 scope granted");
          }
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="px-5 py-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <LockKeyIcon aria-hidden="true" className="size-4 text-emergency" />
          Request a specific domain
        </CardTitle>
        <CardDescription>
          Level 2 requires an explicit domain and a treatment narrative. Restricted source domains
          remain unavailable.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <Button
          type="button"
          className="w-full"
          variant="outline"
          onClick={() => onOpenChange(true)}
          disabled={session.justification_status === "JUSTIFICATION_OVERDUE"}
        >
          Choose Level 2 domains
        </Button>
      </CardContent>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose the smallest useful scope</DialogTitle>
            <DialogDescription>
              This request is added to the active emergency session and is visible in the audit
              trail.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={form.handleSubmit(submit)}>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold">Available domains</legend>
              {domainOptions.map((option) => {
                const checked = selectedDomainSet.has(option.value);
                const alreadyExpanded = expandedDomainSet.has(option.value);
                const disabled = option.restricted || alreadyExpanded;
                return (
                  <div
                    key={option.value}
                    className={`flex items-start gap-3 rounded-xl border p-3 ${
                      disabled
                        ? "cursor-not-allowed border-border/50 opacity-55"
                        : "cursor-pointer border-border/80 hover:border-primary/40"
                    } ${checked ? "border-primary/50 bg-primary/5" : ""}`}
                  >
                    <input
                      id={`emergency-domain-${option.value}`}
                      aria-label={option.label}
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleDomain(option.value)}
                      className="mt-1 size-4 accent-[var(--primary)]"
                    />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {option.label}
                        {option.restricted ? (
                          <LockKeyIcon aria-hidden="true" className="size-3.5 text-emergency" />
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {alreadyExpanded ? "Already in this session" : option.description}
                      </span>
                    </span>
                  </div>
                );
              })}
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="expansion-narrative">
                Why is this needed for immediate treatment?
              </Label>
              <Textarea
                id="expansion-narrative"
                {...form.register("narrative")}
                rows={4}
                minLength={20}
                maxLength={1000}
                placeholder="Describe the immediate treatment decision this domain supports…"
              />
              <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                <span>20–1000 characters</span>
                <span className="tabular-nums">{narrative.length}/1000</span>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Keep current scope
              </Button>
              <Button type="submit" disabled={!form.formState.isValid || expand.isPending}>
                {expand.isPending ? "Requesting…" : "Request Level 2 access"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function JustificationCard({ session }: { session: EmergencySession }) {
  const justify = useSubmitEmergencyJustification();
  const form = useForm<z.infer<typeof emergencyJustificationCreateSchema>>({
    resolver: zodResolver(emergencyJustificationCreateSchema),
    defaultValues: { narrative: "" },
    mode: "onChange",
  });
  const narrative = useWatch({ control: form.control, name: "narrative" }) ?? "";

  function submit(values: z.infer<typeof emergencyJustificationCreateSchema>) {
    justify.mutate(
      { sessionId: session.id, input: values },
      {
        onSuccess: () => {
          form.reset();
          toast.success("Clinical review submitted");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="px-5 py-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheckIcon aria-hidden="true" className="size-4 text-primary" weight="duotone" />
          Clinical review
        </CardTitle>
        <CardDescription>
          {session.justification_status === "SUBMITTED"
            ? "A review has been recorded for this session. Add another note only if the clinical rationale changes."
            : "Record the reason for the emergency disclosure before the review window closes."}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form className="space-y-3" onSubmit={form.handleSubmit(submit)}>
          <Textarea
            {...form.register("narrative")}
            rows={4}
            minLength={20}
            maxLength={1000}
            placeholder="Summarize the clinical decision and why this access was necessary…"
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {session.justification_status === "JUSTIFICATION_OVERDUE"
                ? "Overdue review"
                : "20–1000 characters"}
            </span>
            <span className="tabular-nums">{narrative.length}/1000</span>
          </div>
          <Button
            type="submit"
            variant={
              session.justification_status === "JUSTIFICATION_OVERDUE" ? "destructive" : "outline"
            }
            disabled={!form.formState.isValid || justify.isPending}
            className="w-full"
          >
            {justify.isPending ? "Submitting…" : "Submit clinical review"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EmergencyPageFrame({
  children,
  patientId,
}: {
  children: React.ReactNode;
  patientId: string;
}) {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-10 lg:py-10"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/workspace/patients/${patientId}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Patient records
        </Link>
        <span className="inline-flex items-center gap-2 rounded-full border border-emergency/25 bg-emergency/6 px-3 py-1.5 text-xs font-medium text-emergency">
          <SirenIcon aria-hidden="true" className="size-3.5" />
          Emergency access
        </span>
      </div>
      {children}
    </main>
  );
}

function ContextValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function TimerValue({ label, value, urgent }: { label: string; value: string; urgent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-emergency/15 bg-background/50 p-3 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <ClockIcon aria-hidden="true" className="size-4" />
        {label}
      </span>
      <span
        className={`font-mono text-xs font-semibold tabular-nums ${urgent ? "text-emergency" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

function EmergencyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="max-w-2xl">
      <CardContent className="space-y-4 px-5 py-8 sm:px-7">
        <div className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
          {icon}
        </div>
        <div>
          <h1 className="font-heading text-xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

function InlineError({ error }: { error: Error }) {
  return (
    <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
      {errorMessage(error)}
    </p>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

function isSummarySection(
  value: EmergencySummary[keyof EmergencySummary],
): value is EmergencySummary["allergies"] {
  return Boolean(value && typeof value === "object" && "status" in value && "items" in value);
}

function isSessionActive(session?: EmergencySession) {
  return session?.status === "ACTIVE_SUMMARY" || session?.status === "ACTIVE_EXPANDED";
}

function formatRemaining(value: string) {
  const remaining = Math.max(0, new Date(value).getTime() - Date.now());
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatStatus(status: EmergencySession["status"]) {
  return status.replaceAll("_", " ").toLowerCase();
}

function reasonLabel(reason: EmergencySession["reason_code"]) {
  return reasonOptions.find((option) => option.value === reason)?.label ?? reason;
}

function recordPayloadText(payload: Record<string, unknown>) {
  return Object.entries(payload)
    .filter(([key]) => !["contact", "address", "next_of_kin", "local_patient_id"].includes(key))
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`)
    .join(" · ");
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The emergency service is unavailable. Try again.";
}

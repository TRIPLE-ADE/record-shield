"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  DatabaseIcon,
  FileMagnifyingGlassIcon,
  LockKeyIcon,
  PencilSimpleIcon,
  PlusIcon,
  SirenIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ApiError } from "@/lib/api/client";
import type { SessionContext } from "@/lib/api/contracts/auth";
import type {
  ClinicalRecord,
  Domain,
  RecordCreate,
  RecordCorrection,
} from "@/lib/api/contracts/records";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCorrectLocalRecord, useCreateLocalRecord, useLocalRecords } from "./api";
import { domainGroups, domainMeta } from "./domain-meta";

const noteSchema = z.object({
  text: z.string().trim().min(8, "Add at least 8 characters.").max(4000),
});

const vitalSchema = z.object({
  name: z.string().trim().min(2, "Name the vital.").max(100),
  value: z.coerce.number().finite("Enter a valid number."),
  unit: z.string().trim().min(1, "Add a unit.").max(40),
});

const correctionSchema = z.object({
  text: z.string().trim().min(8, "Add the corrected note.").max(4000),
  correction_reason: z
    .string()
    .trim()
    .min(20, "Explain the correction in at least 20 characters.")
    .max(1000),
});

type NoteValues = z.infer<typeof noteSchema>;
type VitalInput = z.input<typeof vitalSchema>;
type VitalValues = z.output<typeof vitalSchema>;
type CorrectionValues = z.infer<typeof correctionSchema>;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

type PatientSummary = {
  name: string;
  date_of_birth: string;
  gender: string;
};

export function PatientOverview({
  patientId,
  patient,
  localPatientId,
  encounterId,
  context,
  sourceName,
  sourceMode,
  canExchange,
  canEmergency,
}: {
  patientId: string;
  patient?: PatientSummary;
  localPatientId?: string;
  encounterId?: string;
  context: SessionContext & { organization: NonNullable<SessionContext["organization"]> };
  sourceName?: string;
  sourceMode?: "LITE" | "MOCK_EMR";
  canExchange: boolean;
  canEmergency: boolean;
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/workspace"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Workspace overview
        </Link>
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/7 px-3 py-1.5 text-xs font-medium text-primary">
          <ShieldCheckIcon aria-hidden="true" className="size-3.5" weight="duotone" />
          {context.organization.name}
        </span>
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="overflow-hidden border-primary/20 bg-primary/4.5">
          <CardContent className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  <ShieldCheckIcon aria-hidden="true" className="size-6" weight="duotone" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Patient workspace
                  </p>
                  <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                    {patient?.name ?? "Patient record"}
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {localPatientId ?? "Local identifier pending"} · {context.organization.name}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-right">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Access
                </p>
                <p className="mt-1 text-sm font-medium">{formatRole(context.role)}</p>
              </div>
            </div>
            <div className="mt-7 grid gap-4 border-t border-primary/12 pt-5 sm:grid-cols-3">
              <PatientMeta
                label="Date of birth"
                value={patient?.date_of_birth ?? "Not available"}
              />
              <PatientMeta label="Gender" value={patient?.gender ?? "Not available"} />
              <PatientMeta
                label="Encounter"
                value={encounterId ? "Current encounter" : "No open encounter"}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-5 py-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseIcon aria-hidden="true" className="size-4 text-primary" weight="duotone" />
              Record source
            </CardTitle>
            <CardDescription>Every result carries its source and version.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Organization</span>
              <span className="font-medium">{sourceName ?? context.organization.name}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Mode</span>
              <span className="font-medium">
                {sourceMode === "LITE" ? "Lite EMR" : "Existing EMR"}
              </span>
            </div>
            <div className="flex items-center gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
              <CheckCircleIcon
                aria-hidden="true"
                className="size-4 text-success"
                weight="duotone"
              />
              Context checked for this request
            </div>
            {canExchange ? (
              <Link
                href={`/workspace/patients/${patientId}/exchange`}
                className="inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-primary hover:underline"
              >
                Request source access
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
            {canEmergency ? (
              <Link
                href={`/workspace/patients/${patientId}/emergency`}
                className="inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-emergency hover:underline"
              >
                Open emergency summary
                <SirenIcon aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function PatientMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-sm font-medium">{value}</p>
    </div>
  );
}

export function RecordDomainNavigation({
  selectedDomain,
  onSelect,
}: {
  selectedDomain: Domain;
  onSelect: (domain: Domain) => void;
}) {
  return (
    <aside className="space-y-5" aria-label="Record domains">
      <div>
        <p className="mb-2 px-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Domains
        </p>
        <nav className="space-y-4">
          {domainGroups.map((group) => (
            <div key={group.group} className="space-y-1">
              <p className="px-2 text-xs font-medium text-muted-foreground">{group.label}</p>
              {Object.entries(domainMeta)
                .filter(([, meta]) => meta.group === group.group)
                .map(([domain, meta]) => {
                  const Icon = meta.icon;
                  const active = selectedDomain === domain;
                  return (
                    <button
                      key={domain}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      onClick={() => onSelect(domain as Domain)}
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                        weight={active ? "duotone" : "regular"}
                      />
                      <span className="truncate">{meta.shortLabel}</span>
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>
      </div>
      <div className="hidden rounded-xl border border-border/70 bg-card/60 p-3 text-xs leading-5 text-muted-foreground lg:block">
        <LockKeyIcon aria-hidden="true" className="mb-2 size-4 text-primary" weight="duotone" />
        Access is evaluated again for each domain request.
      </div>
    </aside>
  );
}

export function RecordPanel({
  patientId,
  selectedDomain,
  selected,
  canWrite,
  encounterId,
}: {
  patientId: string;
  selectedDomain: Domain;
  selected: ReturnType<typeof useLocalRecords>;
  canWrite: boolean;
  encounterId?: string;
}) {
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Local record set
          </p>
          <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
            {domainMeta[selectedDomain].label}
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ClockIcon aria-hidden="true" className="size-4" />
          {selected.data?.retrieved_at
            ? `Retrieved ${formatDate(selected.data.retrieved_at)}`
            : "Requesting current view"}
        </div>
      </div>

      <RecordResults selected={selected} canWrite={canWrite} />
      <RecordComposer
        patientId={patientId}
        selectedDomain={selectedDomain}
        canWrite={canWrite}
        encounterId={encounterId}
      />
    </div>
  );
}

function RecordResults({
  selected,
  canWrite,
}: {
  selected: ReturnType<typeof useLocalRecords>;
  canWrite: boolean;
}) {
  if (selected.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
    );
  }
  if (selected.error) return <RecordErrorState error={selected.error} />;
  if (!selected.data?.items.length) {
    return (
      <PatientRecordsState
        kind="empty"
        title="No records in this domain"
        description="The current source did not return a record for this patient and context."
      />
    );
  }
  return (
    <div className="space-y-3">
      {selected.data.items.map((record) => (
        <RecordCard key={`${record.id}:${record.version}`} record={record} canCorrect={canWrite} />
      ))}
      {selected.data.completeness_notice ? (
        <p className="px-1 text-xs leading-5 text-muted-foreground">
          {selected.data.completeness_notice}
        </p>
      ) : null}
    </div>
  );
}

function RecordComposer({
  patientId,
  selectedDomain,
  canWrite,
  encounterId,
}: {
  patientId: string;
  selectedDomain: Domain;
  canWrite: boolean;
  encounterId?: string;
}) {
  if (canWrite && encounterId && selectedDomain === "nursing_notes") {
    return <NursingNoteComposer patientId={patientId} encounterId={encounterId} />;
  }
  if (canWrite && encounterId && selectedDomain === "vitals") {
    return <VitalComposer patientId={patientId} encounterId={encounterId} />;
  }
  if (
    canWrite &&
    (selectedDomain === "nursing_notes" || selectedDomain === "vitals") &&
    !encounterId
  ) {
    return (
      <PatientRecordsState
        kind="unavailable"
        title="An open encounter is required to add a record"
        description="The current patient context has no encounter available for a new local record."
      />
    );
  }
  return null;
}

function RecordCard({ record, canCorrect }: { record: ClinicalRecord; canCorrect: boolean }) {
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const meta = domainMeta[record.domain];
  const Icon = meta.icon;
  const canCorrectNote =
    canCorrect && record.domain === "nursing_notes" && "text" in record.payload;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/65 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-primary">
            <Icon aria-hidden="true" className="size-4" weight="duotone" />
          </span>
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{formatSubtype(record.subtype)}</CardTitle>
            <CardDescription className="mt-1">
              Recorded {formatDate(record.recorded_at)}
            </CardDescription>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${sensitivityClass(record.sensitivity)}`}
          >
            {record.sensitivity.charAt(0) + record.sensitivity.slice(1).toLowerCase()}
          </span>
          {canCorrectNote ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Correct record"
              onClick={() => setCorrectionOpen(true)}
            >
              <PencilSimpleIcon aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-4 sm:px-6">
        <RecordPayload payload={record.payload} />
        <Separator />
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <span className="inline-flex items-center gap-2 truncate" title={record.source.record_id}>
            <DatabaseIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            {record.source.local_patient_id} · v{record.version}
          </span>
          <span className="inline-flex items-center gap-2 sm:justify-end">
            <ClockIcon aria-hidden="true" className="size-3.5 shrink-0" />
            Observed {formatDate(record.observed_at)}
          </span>
        </div>
      </CardContent>
      {canCorrectNote ? (
        <CorrectionDialog record={record} open={correctionOpen} onOpenChange={setCorrectionOpen} />
      ) : null}
    </Card>
  );
}

function RecordPayload({ payload }: { payload: ClinicalRecord["payload"] }) {
  if ("text" in payload) {
    return <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{payload.text}</p>;
  }
  const entries = Object.entries(payload as Record<string, unknown>).filter(
    ([, value]) => value !== null,
  );
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {formatLabel(key)}
          </dt>
          <dd className="mt-1 text-sm leading-6">{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function NursingNoteComposer({
  patientId,
  encounterId,
}: {
  patientId: string;
  encounterId: string;
}) {
  const form = useForm<NoteValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: { text: "" },
  });
  const mutation = useCreateLocalRecord();
  const onSubmit = form.handleSubmit((values) => {
    const input: RecordCreate = {
      encounter_id: encounterId,
      subtype: "nursing_note",
      observed_at: new Date().toISOString(),
      payload: { text: values.text },
      references: [],
    };
    mutation.mutate(
      { patientId, domain: "nursing_notes", input },
      {
        onSuccess: () => {
          form.reset();
          toast.success("Nursing note added");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  });
  return (
    <Card className="border-primary/25 bg-primary/3">
      <CardHeader className="px-5 py-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlusIcon aria-hidden="true" className="size-4 text-primary" />
          Add nursing note
        </CardTitle>
        <CardDescription>
          Saved to the open Unity encounter with your signed-in identity.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 sm:px-6">
        <form className="space-y-3" onSubmit={onSubmit}>
          <Label htmlFor="nursing-note">Note</Label>
          <Textarea
            id="nursing-note"
            placeholder="Document the relevant observation or action…"
            {...form.register("text")}
            aria-invalid={Boolean(form.formState.errors.text)}
          />
          {form.formState.errors.text ? (
            <FieldError message={form.formState.errors.text.message} />
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save note"}
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function VitalComposer({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const form = useForm<VitalInput, unknown, VitalValues>({
    resolver: zodResolver(vitalSchema),
    defaultValues: { name: "", unit: "" },
  });
  const mutation = useCreateLocalRecord();
  const onSubmit = form.handleSubmit((values) => {
    const input: RecordCreate = {
      encounter_id: encounterId,
      subtype: "vital",
      observed_at: new Date().toISOString(),
      payload: { name: values.name, value: values.value, unit: values.unit },
      references: [],
    };
    mutation.mutate(
      { patientId, domain: "vitals", input },
      {
        onSuccess: () => {
          form.reset();
          toast.success("Vital added");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  });
  return (
    <Card className="border-primary/25 bg-primary/3">
      <CardHeader className="px-5 py-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlusIcon aria-hidden="true" className="size-4 text-primary" />
          Add vital
        </CardTitle>
        <CardDescription>
          Record one measured value against the open Unity encounter.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 sm:px-6">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end"
          onSubmit={onSubmit}
        >
          <div className="space-y-1.5">
            <Label htmlFor="vital-name">Measure</Label>
            <Input
              id="vital-name"
              placeholder="Temperature"
              {...form.register("name")}
              aria-invalid={Boolean(form.formState.errors.name)}
            />
            {form.formState.errors.name ? (
              <FieldError message={form.formState.errors.name.message} />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vital-value">Value</Label>
            <Input
              id="vital-value"
              type="number"
              step="any"
              {...form.register("value", { valueAsNumber: true })}
              aria-invalid={Boolean(form.formState.errors.value)}
            />
            {form.formState.errors.value ? (
              <FieldError message={form.formState.errors.value.message} />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vital-unit">Unit</Label>
            <Input
              id="vital-unit"
              placeholder="°C"
              {...form.register("unit")}
              aria-invalid={Boolean(form.formState.errors.unit)}
            />
            {form.formState.errors.unit ? (
              <FieldError message={form.formState.errors.unit.message} />
            ) : null}
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CorrectionDialog({
  record,
  open,
  onOpenChange,
}: {
  record: ClinicalRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currentText = "text" in record.payload ? record.payload.text : "";
  const form = useForm<CorrectionValues>({
    resolver: zodResolver(correctionSchema),
    defaultValues: { text: currentText, correction_reason: "" },
  });
  const mutation = useCorrectLocalRecord();
  const onSubmit = form.handleSubmit((values) => {
    const input: RecordCorrection = {
      payload: { text: values.text },
      correction_reason: values.correction_reason,
    };
    mutation.mutate(
      { recordId: record.id, version: record.version, input },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success("Record correction saved");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct nursing note</DialogTitle>
          <DialogDescription>
            This creates a new version and keeps the previous note in the audit history.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="correction-text">Corrected note</Label>
            <Textarea
              id="correction-text"
              {...form.register("text")}
              aria-invalid={Boolean(form.formState.errors.text)}
            />
            {form.formState.errors.text ? (
              <FieldError message={form.formState.errors.text.message} />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="correction-reason">Reason for correction</Label>
            <Textarea
              id="correction-reason"
              placeholder="Explain what changed and why…"
              {...form.register("correction_reason")}
              aria-invalid={Boolean(form.formState.errors.correction_reason)}
            />
            {form.formState.errors.correction_reason ? (
              <FieldError message={form.formState.errors.correction_reason.message} />
            ) : null}
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save correction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordErrorState({ error }: { error: Error | null }) {
  const apiError = error instanceof ApiError ? error : undefined;
  if (apiError?.status === 403) {
    return (
      <PatientRecordsState
        kind="denied"
        title="This domain is outside the current scope"
        description="Your role can continue with the domains assigned to this context."
      />
    );
  }
  if (apiError?.status === 404) {
    return (
      <PatientRecordsState
        kind="empty"
        title="Patient record not found"
        description="The current source could not find this patient in its local register."
      />
    );
  }
  return (
    <PatientRecordsState
      kind="unavailable"
      title="Source unavailable"
      description={apiError?.message ?? "The record source could not be reached. Try again."}
    />
  );
}

export function PatientRecordsState({
  kind,
  title,
  description,
}: {
  kind: "denied" | "empty" | "unavailable";
  title: string;
  description: string;
}) {
  const Icon =
    kind === "denied"
      ? LockKeyIcon
      : kind === "empty"
        ? FileMagnifyingGlassIcon
        : WarningCircleIcon;
  return (
    <main id="main-content" className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 lg:py-16">
      <Card>
        <CardContent className="flex items-start gap-4 p-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-primary">
            <Icon aria-hidden="true" className="size-5" weight="duotone" />
          </span>
          <div>
            <p className="font-heading text-lg font-semibold">{title}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            <Link
              href="/workspace"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Return to workspace
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export function PatientRecordsLoading() {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10"
    >
      <Skeleton className="h-5 w-36" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </main>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatRole(role: string | null) {
  if (!role) return "Patient";
  return role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatSubtype(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function sensitivityClass(level: ClinicalRecord["sensitivity"]) {
  if (level === "RESTRICTED")
    return "border-sensitivity-restricted/25 bg-sensitivity-restricted/10 text-sensitivity-restricted";
  if (level === "SENSITIVE")
    return "border-sensitivity-sensitive/25 bg-sensitivity-sensitive/10 text-sensitivity-sensitive";
  return "border-sensitivity-standard/25 bg-sensitivity-standard/10 text-sensitivity-standard";
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
    return "This record changed before the correction was saved. Refresh and try again.";
  }
  if (error instanceof Error) return error.message;
  return "The record could not be saved. Try again.";
}

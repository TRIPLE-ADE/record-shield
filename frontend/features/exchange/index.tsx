"use client";

import Link from "next/link";
import { redirect } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  DatabaseIcon,
  FileArrowUpIcon,
  FileMagnifyingGlassIcon,
  LinkSimpleIcon,
  LockKeyIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import {
  consentRequestCreateSchema,
  type ConsentRequestCreate,
  type ExchangeDomain,
} from "@/lib/api/contracts/exchange";
import type { ClinicalRecord } from "@/lib/api/contracts/records";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useLocalRecords } from "@/features/patient-records/api";
import { useSession } from "@/features/auth/use-session";
import {
  useCancelConsent,
  useConsentRequests,
  useCreateConsentRequest,
  useDiscoverSources,
  useRemoteRecords,
} from "./api";

const requestDomains: Array<{ value: ExchangeDomain; label: string; description: string }> = [
  { value: "allergies", label: "Allergies", description: "Known reactions and status" },
  { value: "medications", label: "Medications", description: "Active medication list" },
  { value: "investigations", label: "Investigations", description: "Selected source results" },
  { value: "diagnoses", label: "Diagnoses", description: "Relevant diagnoses" },
];

export default function ExchangePage({ patientId }: { patientId: string }) {
  const session = useSession();
  const context = session.data;
  const [sourceId, setSourceId] = useState("");
  const localRecords = useLocalRecords(patientId, "demographics", "treatment", {
    enabled: Boolean(context?.organization && context.patient_id === patientId),
  });
  const receivingEncounterId = localRecords.data?.items[0]?.encounter_id ?? "";
  const sources = useDiscoverSources(patientId, receivingEncounterId, Boolean(context));
  const requests = useConsentRequests(patientId, Boolean(context));
  const requestMutation = useCreateConsentRequest();
  const cancelMutation = useCancelConsent();
  const form = useForm<ConsentRequestCreate>({
    resolver: zodResolver(consentRequestCreateSchema),
    defaultValues: {
      patient_id: patientId,
      source_org_id: "",
      receiving_encounter_id: "",
      purpose: "treatment",
      requested_domains: [],
      reason: "",
    },
  });
  const selectedDomains = useWatch({ control: form.control, name: "requested_domains" }) ?? [];
  const patientName = getPatientName(localRecords.data?.items[0]);
  const activeGrant = requests.data?.items.find(
    (item) => item.grant?.status === "ACTIVE" && item.grant.expires_at > new Date().toISOString(),
  )?.grant;
  const activeRequest = activeGrant
    ? requests.data?.items.find((item) => item.grant?.id === activeGrant.id)?.request
    : undefined;
  const remote = useRemoteRecords(
    patientId,
    activeGrant?.source_org_id ?? "",
    activeGrant?.id ?? "",
    activeGrant?.domains ?? [],
    Boolean(activeGrant),
  );

  if (session.isPending || localRecords.isPending) return <ExchangeLoading />;
  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  if (!context || context.patient_id !== patientId || !context.organization) {
    return (
      <ExchangeState
        kind="denied"
        title="Exchange context unavailable"
        description="The current session is not linked to this patient."
      />
    );
  }
  if (!isExchangePractitioner(context.role)) {
    return (
      <ExchangeState
        kind="denied"
        title="Exchange is limited to treating practitioners"
        description="This role can continue with local records in its current context."
      />
    );
  }

  const submitRequest = form.handleSubmit((values) => {
    requestMutation.mutate(
      {
        ...values,
        patient_id: patientId,
        source_org_id: sourceId,
        receiving_encounter_id: receivingEncounterId,
      },
      {
        onSuccess: () => {
          form.reset({
            patient_id: patientId,
            source_org_id: sourceId,
            receiving_encounter_id: receivingEncounterId,
            purpose: "treatment",
            requested_domains: [],
            reason: "",
          });
          toast.success("Consent request sent");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  });

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
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/7 px-3 py-1.5 text-xs font-medium text-primary">
          <LinkSimpleIcon aria-hidden="true" className="size-3.5" />
          Verified source exchange
        </span>
      </div>

      <section className="flex flex-col justify-between gap-5 border-b border-border/70 pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Patient access
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Request source records
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Ask the patient to approve an exact, time-limited set of records for{" "}
            {patientName ?? "this patient"}.
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-right">
          <p className="text-xs text-muted-foreground">Receiving context</p>
          <p className="mt-1 text-sm font-medium">{context.organization.name}</p>
        </div>
      </section>

      <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <Card>
          <CardHeader className="px-5 py-5 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <DatabaseIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
              Verified sources
            </CardTitle>
            <CardDescription>
              Only linked facilities with an active receiving encounter appear here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5 sm:px-6">
            {sources.isPending ? <Skeleton className="h-20 rounded-xl" /> : null}
            {sources.error ? <ExchangeError error={sources.error} /> : null}
            {sources.data?.items.map((source) => {
              const selected = source.organization.organization_id === sourceId;
              return (
                <button
                  key={source.organization.organization_id}
                  type="button"
                  aria-label={`Select ${source.organization.name}`}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${selected ? "border-primary bg-primary/7" : "border-border/70 bg-card hover:border-primary/35"}`}
                  onClick={() => {
                    setSourceId(source.organization.organization_id);
                    form.setValue("source_org_id", source.organization.organization_id, {
                      shouldValidate: true,
                    });
                    form.setValue("receiving_encounter_id", receivingEncounterId, {
                      shouldValidate: true,
                    });
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block font-medium">{source.organization.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Existing EMR · linked facility
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                      <CheckCircleIcon aria-hidden="true" className="size-4" weight="duotone" />
                      Available
                    </span>
                  </div>
                </button>
              );
            })}
            {!sources.isPending && !sources.error && !sources.data?.items.length ? (
              <ExchangeState
                kind="empty"
                title="No linked source is available"
                description="The current encounter has no eligible remote facility."
                compact
              />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-5 py-5 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileArrowUpIcon
                aria-hidden="true"
                className="size-5 text-primary"
                weight="duotone"
              />
              Define the request
            </CardTitle>
            <CardDescription>
              The patient sees this reason, practitioner, source, and exact domain set.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-6 sm:px-6">
            <form className="space-y-5" onSubmit={submitRequest}>
              <div>
                <p className="text-sm font-medium">Domains requested</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {requestDomains.map((domain) => {
                    const checked = selectedDomains.includes(domain.value);
                    return (
                      <label
                        key={domain.value}
                        htmlFor={`${domain.value}-domain`}
                        aria-label={domain.label}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${checked ? "border-primary/40 bg-primary/6" : "border-border/70 hover:bg-muted/50"}`}
                      >
                        <input
                          id={`${domain.value}-domain`}
                          type="checkbox"
                          className="mt-0.5 size-4 accent-[var(--primary)]"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? selectedDomains.filter((value) => value !== domain.value)
                              : [...selectedDomains, domain.value];
                            form.setValue("requested_domains", next, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }}
                        />
                        <span>
                          <span className="block text-sm font-medium">{domain.label}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {domain.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {form.formState.errors.requested_domains ? (
                  <FieldError message={form.formState.errors.requested_domains.message} />
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="consent-reason">Patient-visible reason</Label>
                <Textarea
                  id="consent-reason"
                  placeholder="Explain why these source records are relevant to current treatment…"
                  {...form.register("reason")}
                  aria-invalid={Boolean(form.formState.errors.reason)}
                />
                {form.formState.errors.reason ? (
                  <FieldError message={form.formState.errors.reason.message} />
                ) : null}
              </div>

              {!sourceId ? (
                <p className="text-xs text-muted-foreground">
                  Choose a verified source to continue.
                </p>
              ) : null}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={!sourceId || !receivingEncounterId || requestMutation.isPending}
                >
                  {requestMutation.isPending ? "Sending…" : "Send consent request"}
                  <ArrowRightIcon aria-hidden="true" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader className="px-5 py-5 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClockIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
              Request status
            </CardTitle>
            <CardDescription>
              Approval is controlled by the patient portal and expires by server time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5 sm:px-6">
            {requests.isPending ? <Skeleton className="h-24 rounded-xl" /> : null}
            {requests.error ? <ExchangeError error={requests.error} /> : null}
            {requests.data?.items.map(({ request, grant }) => (
              <div key={request.id} className="rounded-xl border border-border/70 bg-card/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{request.source.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {request.requested_domains.map(formatDomain).join(" · ")}
                    </p>
                  </div>
                  <RequestStatus status={request.status} />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{request.reason}</p>
                {grant?.status === "ACTIVE" ? (
                  <p className="mt-3 text-xs font-medium text-success">
                    Approved until {formatDate(grant.expires_at)}
                  </p>
                ) : null}
                {request.status === "PENDING" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    disabled={cancelMutation.isPending}
                    onClick={() =>
                      cancelMutation.mutate(
                        { requestId: request.id, input: { expected_version: request.version } },
                        {
                          onSuccess: () => toast.success("Consent request cancelled"),
                          onError: (error) => toast.error(errorMessage(error)),
                        },
                      )
                    }
                  >
                    Cancel request
                  </Button>
                ) : null}
              </div>
            ))}
            {!requests.isPending && !requests.error && !requests.data?.items.length ? (
              <ExchangeState
                kind="empty"
                title="No requests yet"
                description="Approved source access will appear here with its expiry."
                compact
              />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-5 py-5 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheckIcon
                aria-hidden="true"
                className="size-5 text-primary"
                weight="duotone"
              />
              Approved remote records
            </CardTitle>
            <CardDescription>
              Read-only records are released only after the exact grant is active.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-5 sm:px-6">
            {!activeGrant ? (
              <ExchangeState
                kind="empty"
                title="Waiting for patient approval"
                description="No remote clinical payload is available before a matching grant is active."
                compact
              />
            ) : remote.isPending ? (
              <Skeleton className="h-32 rounded-xl" />
            ) : remote.error ? (
              <ExchangeError error={remote.error} />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2.5 text-xs">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <DatabaseIcon aria-hidden="true" className="size-4 text-primary" />
                    {activeGrant.source.name}
                  </span>
                  <span className="text-muted-foreground">
                    Grant {activeGrant.domains.map(formatDomain).join(" · ")}
                  </span>
                </div>
                {remote.data?.items.map((record) => (
                  <RemoteRecord key={`${record.id}:${record.version}`} record={record} />
                ))}
                {!remote.data?.items.length ? (
                  <ExchangeState
                    kind="empty"
                    title="No approved records returned"
                    description="The source has no records in the approved domains."
                    compact
                  />
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {activeRequest ? (
        <p className="mt-5 text-xs text-muted-foreground">
          Request bound to {activeRequest.practitioner_name} · {activeRequest.recipient.name} ·
          read-only scope
        </p>
      ) : null}
    </main>
  );
}

function RemoteRecord({ record }: { record: ClinicalRecord }) {
  const payload = record.payload;
  return (
    <div className="rounded-xl border border-border/70 bg-card/65 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{formatDomain(record.domain)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Observed {formatDate(record.observed_at)}
          </p>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/7 px-2.5 py-1 text-[0.68rem] font-semibold text-primary">
          Read only
        </span>
      </div>
      <p className="mt-3 text-sm leading-6">
        {"text" in payload
          ? payload.text
          : Object.entries(payload as Record<string, unknown>)
              .map(([key, value]) => `${formatDomain(key)}: ${String(value)}`)
              .join(" · ")}
      </p>
      <Separator className="my-3" />
      <p className="text-xs text-muted-foreground">
        {record.source.local_patient_id} · source version {record.source.version} ·{" "}
        {record.source.record_id}
      </p>
    </div>
  );
}

function RequestStatus({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: "border-warning/25 bg-warning/10 text-warning-foreground",
    APPROVED: "border-success/25 bg-success/10 text-success",
    DENIED: "border-destructive/25 bg-destructive/10 text-destructive",
    CANCELLED: "border-border bg-muted text-muted-foreground",
    EXPIRED: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${styles[status] ?? styles.PENDING}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function ExchangeError({ error }: { error: Error | null }) {
  const apiError = error instanceof ApiError ? error : undefined;
  return (
    <ExchangeState
      kind={apiError?.status === 403 ? "denied" : "unavailable"}
      title={apiError?.status === 403 ? "Access is outside this scope" : "Source unavailable"}
      description={apiError?.message ?? "The request could not be completed."}
      compact
    />
  );
}

function ExchangeState({
  kind,
  title,
  description,
  compact = false,
}: {
  kind: "denied" | "empty" | "unavailable";
  title: string;
  description: string;
  compact?: boolean;
}) {
  const Icon =
    kind === "denied"
      ? LockKeyIcon
      : kind === "empty"
        ? FileMagnifyingGlassIcon
        : WarningCircleIcon;
  return (
    <div
      className={`rounded-xl border border-dashed border-border bg-muted/40 ${compact ? "p-4" : "mx-auto mt-12 max-w-2xl p-6"}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-primary ring-1 ring-border">
          <Icon aria-hidden="true" className="size-4" weight="duotone" />
        </span>
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function ExchangeLoading() {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10"
    >
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </main>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-destructive">{message}</p> : null;
}

function isExchangePractitioner(role: string | null) {
  return ["ATTENDING_DOCTOR", "VISITING_DOCTOR", "EMERGENCY_DOCTOR", "NURSE_MIDWIFE"].includes(
    role ?? "",
  );
}

function getPatientName(record: ClinicalRecord | undefined) {
  const payload = record?.payload;
  return payload && "name" in payload ? payload.name : undefined;
}

function formatDomain(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "The request could not be completed.";
}

"use client";

import { redirect } from "next/navigation";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BellIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  LinkSimpleIcon,
  LockKeyIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import {
  approveConsentSchema,
  type ApproveConsent,
  type ConsentRequest,
  type ExchangeDomain,
} from "@/lib/api/contracts/exchange";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useLogout, useSession } from "@/features/auth/use-session";
import {
  useApproveConsent,
  useDenyConsent,
  usePortal,
  useRevokeGrant,
} from "@/features/exchange/api";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default function PortalPage() {
  const router = useRouter();
  const session = useSession();
  const logout = useLogout();
  const context = session.data;
  const portal = usePortal(Boolean(context?.user.kind === "PATIENT"));

  if (session.isPending || portal.isPending) return <PortalLoading />;
  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  if (!context || context.user.kind !== "PATIENT") {
    return (
      <PortalState
        title="Patient portal only"
        description="Sign in with the patient account linked to the request."
      />
    );
  }
  if (portal.error) {
    return <PortalState title="Portal unavailable" description={portal.error.message} />;
  }
  if (!portal.data)
    return <PortalState title="Portal unavailable" description="No portal context was returned." />;

  const data = portal.data;
  const handleLogout = () =>
    logout.mutate(undefined, { onSettled: () => router.replace("/login") });
  return (
    <main
      id="main-content"
      className="min-h-screen bg-background px-4 py-7 sm:px-6 lg:px-10 lg:py-10"
    >
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShieldCheckIcon aria-hidden="true" className="size-5" weight="duotone" />
            </span>
            <div>
              <p className="font-heading text-sm font-semibold tracking-tight">RecordShield</p>
              <p className="text-xs text-muted-foreground">Patient access portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/65 px-3 py-2">
            <UserCircleIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
            <div>
              <p className="text-sm font-medium">{data.patient.name}</p>
              <p className="text-xs text-muted-foreground">{data.patient.health_id}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} disabled={logout.isPending}>
            Sign out
          </Button>
        </header>

        <section className="py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Your connected care
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Review who can access your records.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Each request names the practitioner, source, reason, domains, and duration. You choose
            the exact scope.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="px-5 py-5 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BellIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
                  Pending requests
                </CardTitle>
                <CardDescription>
                  Nothing is shared until you approve a selected scope.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-5 pb-6 sm:px-6">
                {data.requests.items
                  .filter((request) => request.status === "PENDING")
                  .map((request) => (
                    <ApprovalCard key={request.id} request={request} />
                  ))}
                {!data.requests.items.some((request) => request.status === "PENDING") ? (
                  <PortalState
                    compact
                    title="No pending requests"
                    description="New requests will appear here when a practitioner asks for access."
                  />
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-5 py-5 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <EyeIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
                  Active access
                </CardTitle>
                <CardDescription>
                  Revoke a grant at any time. It takes effect before the next protected read.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5 sm:px-6">
                {data.grants.items
                  .filter((grant) => grant.status === "ACTIVE")
                  .map((grant) => (
                    <GrantCard key={grant.id} grant={grant} />
                  ))}
                {!data.grants.items.some((grant) => grant.status === "ACTIVE") ? (
                  <PortalState
                    compact
                    title="No active grants"
                    description="Approved access will be listed here with its server expiry."
                  />
                ) : null}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card>
              <CardHeader className="px-5 py-5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <LinkSimpleIcon aria-hidden="true" className="size-4 text-primary" />
                  Connected facilities
                </CardTitle>
                <CardDescription>
                  Verified facilities linked to your RecordShield identity.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5">
                {data.facilities.items.map((facility) => (
                  <div
                    key={facility.organization_id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/60 px-3 py-2.5"
                  >
                    <span className="text-sm font-medium">{facility.name}</span>
                    <span className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                      {facility.mode === "LITE" ? "Lite" : "EMR"}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="px-5 py-5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClockIcon aria-hidden="true" className="size-4 text-primary" />
                  Access history
                </CardTitle>
                <CardDescription>Metadata about completed disclosures.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5">
                {data.access.items.map((event) => (
                  <div
                    key={event.event_id}
                    className="border-b border-border/65 pb-3 last:border-0 last:pb-0"
                  >
                    <p className="text-sm font-medium">{event.practitioner_name}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {event.source.name} · {event.domains.map(formatDomain).join(" · ")} ·{" "}
                      {formatDate(event.occurred_at)}
                    </p>
                  </div>
                ))}
                {!data.access.items.length ? (
                  <p className="text-sm text-muted-foreground">No access events yet.</p>
                ) : null}
              </CardContent>
            </Card>
            {data.notifications.items.length ? (
              <p className="text-xs leading-5 text-muted-foreground">
                {data.notifications.items.length} notification
                {data.notifications.items.length === 1 ? "" : "s"} available.
              </p>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}

function ApprovalCard({ request }: { request: ConsentRequest }) {
  const approve = useApproveConsent();
  const deny = useDenyConsent();
  const form = useForm<ApproveConsent>({
    resolver: zodResolver(approveConsentSchema),
    defaultValues: { selected_domains: [], duration: "PT24H", expected_version: request.version },
  });
  const selectedDomains = useWatch({ control: form.control, name: "selected_domains" }) ?? [];
  const duration = useWatch({ control: form.control, name: "duration" }) ?? "PT24H";
  const selectedDomainSet = new Set(selectedDomains);

  const submit = form.handleSubmit((values) => {
    approve.mutate(
      { requestId: request.id, input: values },
      {
        onSuccess: () => toast.success("Access approved"),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  });

  return (
    <form className="rounded-xl border border-primary/20 bg-primary/3 p-4 sm:p-5" onSubmit={submit}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{request.practitioner_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {request.recipient.name} requests records from {request.source.name}
          </p>
        </div>
        <span className="rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-[0.68rem] font-semibold text-warning-foreground">
          Pending
        </span>
      </div>
      <div className="mt-4 rounded-lg bg-background/70 p-3 text-sm leading-6">
        <span className="font-medium">Reason: </span>
        {request.reason}
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Choose domains
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {request.requested_domains.map((domain) => {
            const checked = selectedDomainSet.has(domain);
            return (
              <label
                key={domain}
                htmlFor={`approve-${request.id}-${domain}`}
                aria-label={formatDomain(domain)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${checked ? "border-primary/40 bg-primary/8" : "border-border/70"}`}
              >
                <input
                  id={`approve-${request.id}-${domain}`}
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={checked}
                  onChange={() =>
                    form.setValue(
                      "selected_domains",
                      checked
                        ? selectedDomains.filter((value) => value !== domain)
                        : [...selectedDomains, domain],
                      { shouldDirty: true, shouldValidate: true },
                    )
                  }
                />
                <span>{formatDomain(domain)}</span>
              </label>
            );
          })}
        </div>
        {form.formState.errors.selected_domains ? (
          <p className="mt-1 text-xs text-destructive">Choose at least one domain.</p>
        ) : null}
      </div>
      <div className="mt-4 space-y-1.5">
        <Label htmlFor={`duration-${request.id}`}>Duration</Label>
        <Select
          value={duration}
          onValueChange={(value) =>
            form.setValue("duration", value as ApproveConsent["duration"], { shouldDirty: true })
          }
        >
          <SelectTrigger id={`duration-${request.id}`} className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PT1H">1 hour</SelectItem>
            <SelectItem value="PT24H">24 hours</SelectItem>
            <SelectItem value="P7D">7 days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={deny.isPending || approve.isPending}
          onClick={() =>
            deny.mutate(
              { requestId: request.id, input: { expected_version: request.version } },
              {
                onSuccess: () => toast.success("Request denied"),
                onError: (error) => toast.error(errorMessage(error)),
              },
            )
          }
        >
          <XCircleIcon aria-hidden="true" />
          Deny
        </Button>
        <Button type="submit" disabled={approve.isPending || deny.isPending}>
          {approve.isPending ? "Saving…" : "Approve selected access"}
          <CheckCircleIcon aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}

function GrantCard({
  grant,
}: {
  grant: {
    id: string;
    source: { name: string };
    practitioner_name: string;
    domains: ExchangeDomain[];
    expires_at: string;
    version: number;
  };
}) {
  const revoke = useRevokeGrant();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/20 bg-success/5 p-4">
      <div>
        <p className="text-sm font-medium">
          {grant.practitioner_name} · {grant.source.name}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {grant.domains.map(formatDomain).join(" · ")} · expires {formatDate(grant.expires_at)}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={revoke.isPending}
        onClick={() =>
          revoke.mutate(
            { grantId: grant.id, input: { expected_version: grant.version } },
            {
              onSuccess: () => toast.success("Access revoked"),
              onError: (error) => toast.error(errorMessage(error)),
            },
          )
        }
      >
        <LockKeyIcon aria-hidden="true" />
        Revoke
      </Button>
    </div>
  );
}

function PortalState({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-border bg-muted/40 ${compact ? "p-4" : "mx-auto mt-16 max-w-xl p-6"}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-primary ring-1 ring-border">
          <ShieldCheckIcon aria-hidden="true" className="size-4" weight="duotone" />
        </span>
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function PortalLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <Skeleton className="h-12 w-56" />
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </main>
  );
}

function formatDomain(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "The request could not be completed.";
}

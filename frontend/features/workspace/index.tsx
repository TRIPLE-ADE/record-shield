"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockCountdownIcon,
  DatabaseIcon,
  LockKeyIcon,
  PulseIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { sessionQueryKey, useSession } from "@/features/auth/use-session";

function formatRole(role: string | null) {
  if (!role) return "Patient";
  return role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function humanizePermission(permission: string) {
  return permission
    .split(".")
    .at(-1)
    ?.replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const timeFormatter = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatTime(value: string) {
  return timeFormatter.format(new Date(value));
}

export default function WorkspacePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();

  useEffect(() => {
    if (session.error instanceof ApiError && session.error.status === 401) {
      router.replace("/login");
    }
  }, [router, session.error]);

  if (session.isPending) return <WorkspaceLoading />;

  if (!session.data) {
    const isContextDenied = session.error instanceof ApiError && session.error.status === 403;
    return (
      <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
        <Card className="mx-auto max-w-xl border-warning/35 bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WarningCircleIcon
                aria-hidden="true"
                className="size-5 text-warning"
                weight="duotone"
              />
              {isContextDenied ? "Context needs review" : "Workspace unavailable"}
            </CardTitle>
            <CardDescription>
              {isContextDenied
                ? "Your signed-in identity is known, but its current membership context is no longer active. No protected data was loaded."
                : "The current session could not be verified. No protected data was loaded."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.replace("/login")}>
              Return to sign in
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const context = session.data;
  const firstName = context.user.username.split(".")[0];

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10"
    >
      <section className="flex flex-col justify-between gap-5 border-b border-border/70 pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Overview</p>
          <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Good to see you, {firstName}.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Your protected workspace is ready. The context below came from the current session and
            will be rechecked before protected records are released.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: sessionQueryKey })}
          disabled={session.isFetching}
        >
          <ArrowClockwiseIcon
            aria-hidden="true"
            className={session.isFetching ? "animate-spin" : ""}
          />
          Refresh context
        </Button>
      </section>

      <section className="grid gap-5 py-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
        <Card className="border-primary/20 bg-primary/4.5 shadow-sm">
          <CardHeader className="border-b border-primary/12 px-5 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheckIcon
                    aria-hidden="true"
                    className="size-5 text-primary"
                    weight="duotone"
                  />
                  Current access context
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Informational context from the server. It is never a permission by itself.
                </CardDescription>
              </div>
              <Badge className="bg-success/12 text-success">Verified</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
            <ContextItem
              label="Identity"
              value={context.user.username}
              detail={context.user.kind}
            />
            <ContextItem
              label="Role"
              value={formatRole(context.role)}
              detail={context.membership_id ? "Active membership" : "No membership"}
            />
            <ContextItem
              label="Hospital"
              value={context.organization?.name ?? "Patient portal"}
              detail={
                context.organization?.mode === "LITE"
                  ? "RecordShield Lite EMR"
                  : "Existing mock EMR"
              }
            />
            <ContextItem
              label="Shift"
              value={context.shift?.active ? "Active now" : "No active shift"}
              detail={
                context.shift
                  ? `${formatTime(context.shift.starts_at)} – ${formatTime(context.shift.ends_at)}`
                  : "No duty window returned"
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-5 py-5 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <LockKeyIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
              Session guardrails
            </CardTitle>
            <CardDescription>What this session is prepared to request.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5 sm:px-6">
            {context.permissions_summary.length ? (
              context.permissions_summary.map((permission) => (
                <div key={permission} className="flex items-center gap-2 text-sm">
                  <CheckCircleIcon
                    aria-hidden="true"
                    className="size-4 text-success"
                    weight="duotone"
                  />
                  <span>{humanizePermission(permission)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No staff permissions are attached to this session.
              </p>
            )}
            <div className="mt-4 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
              A permission summary describes possible actions. Each patient decision is evaluated
              again at the protected request.
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <NextStepCard
          icon={<DatabaseIcon aria-hidden="true" />}
          eyebrow="Coming next"
          title="Local records"
          copy="Known patient encounters and source-aware projections will appear here next."
        />
        <NextStepCard
          icon={<PulseIcon aria-hidden="true" />}
          eyebrow="Protected later"
          title="Exchange and consent"
          copy="Cross-hospital discovery stays behind explicit purpose, scope, and patient approval."
        />
        <NextStepCard
          icon={<ClockCountdownIcon aria-hidden="true" />}
          eyebrow="Evidence"
          title="Session timing"
          copy="Idle and absolute expiry are server decisions; this view never extends the session."
        />
      </section>

      <p className="mt-8 text-xs text-muted-foreground">
        Synthetic data only · no clinical payload has been requested on this page.
      </p>
    </main>
  );
}

function ContextItem({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function NextStepCard({
  icon,
  eyebrow,
  title,
  copy,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <Card className="bg-card/70">
      <CardContent className="p-5">
        <span className="grid size-9 place-items-center rounded-lg bg-muted text-primary [&_svg]:size-4">
          {icon}
        </span>
        <p className="mt-5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-primary">
          {eyebrow}
        </p>
        <h2 className="mt-2 font-heading text-base font-medium">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
      </CardContent>
    </Card>
  );
}

function WorkspaceLoading() {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-10"
    >
      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </main>
  );
}

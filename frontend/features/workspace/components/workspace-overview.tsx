"use client";

import Link from "next/link";
import { ArrowClockwiseIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { formatRole, formatTime } from "../utils/format";
import type { WorkspaceOverviewProps } from "../types";
import { AssignedPatients } from "./assigned-patients";
import { ActionQueue } from "./action-queue";
import { isTreatingPractitioner } from "@/utils/authorization";

export function WorkspaceOverview({ context, isFetching, onRefresh }: WorkspaceOverviewProps) {
  const canRead = context.permissions_summary.includes("local_records.read_with_context");
  const canRequest = isTreatingPractitioner(context.role);
  const security = context.role === "SECURITY_ADMIN" || context.role === "TRUST_OPERATOR";
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-10"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {context.organization?.name ?? "RecordShield"} <span aria-hidden="true">/</span>{" "}
            {formatRole(context.role)}
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">Home</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {security
              ? "Review access activity and keep your organisation running safely."
              : "Pick up patient care and keep record requests moving."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isFetching}>
          <ArrowClockwiseIcon aria-hidden="true" className={isFetching ? "animate-spin" : ""} />
          Refresh
        </Button>
      </header>
      {context.shift ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span className="font-medium">{context.shift.active ? "On duty" : "Off duty"}</span>
          <span className="text-muted-foreground">
            Shift {formatTime(context.shift.starts_at)} – {formatTime(context.shift.ends_at)}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">{context.user.username}</span>
        </div>
      ) : null}
      {canRead ? <AssignedPatients context={context} /> : null}
      {canRequest ? (
        <section
          aria-labelledby="requests-heading"
          className="rounded-xl border border-border bg-card"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h2 id="requests-heading" className="font-semibold">
              Needs attention
            </h2>
            <Link
              href="/workspace/requests"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary"
            >
              View requests
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          </div>
          <ActionQueue />
        </section>
      ) : null}
      {security ? (
        <section className="grid gap-4 sm:grid-cols-2" aria-label="Administration tasks">
          <Link
            href="/workspace/security"
            className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary"
          >
            <h2 className="text-lg font-semibold">Review security activity</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Investigate alerts, review access events, and verify audit evidence.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary">
              Open security
              <ArrowRightIcon aria-hidden="true" />
            </span>
          </Link>
          <Link
            href="/workspace/security/admin"
            className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary"
          >
            <h2 className="text-lg font-semibold">Manage access</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {context.role === "TRUST_OPERATOR"
                ? "Manage participating organisations and access suspensions."
                : "Maintain staff assignments, disclosure policies, and membership access."}
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary">
              Open administration
              <ArrowRightIcon aria-hidden="true" />
            </span>
          </Link>
        </section>
      ) : null}
    </main>
  );
}

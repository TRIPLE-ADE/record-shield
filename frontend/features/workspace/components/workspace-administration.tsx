"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react";
import type { SessionContext } from "@/lib/api/contracts/auth";

export function WorkspaceAdministration({ role }: { role: SessionContext["role"] }) {
  return (
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
          {role === "TRUST_OPERATOR"
            ? "Manage participating organisations and access suspensions."
            : "Maintain staff assignments, disclosure policies, and membership access."}
        </p>
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary">
          Open administration
          <ArrowRightIcon aria-hidden="true" />
        </span>
      </Link>
    </section>
  );
}

"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { apiCapabilities } from "@/lib/api/capabilities";
import { AccessRequestList } from "@/features/access-requests/components/access-request-list";
import { ActionQueue } from "./action-queue";

export function WorkspaceRequests() {
  return (
    <section aria-labelledby="requests-heading" className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id="requests-heading" className="font-semibold">
          {apiCapabilities.worklist ? "Needs attention" : "Your access requests"}
        </h2>
        <Link
          href="/workspace/requests"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary"
        >
          View requests
          <ArrowRightIcon aria-hidden="true" />
        </Link>
      </div>
      {apiCapabilities.worklist ? (
        <ActionQueue />
      ) : (
        <>
          <p className="px-5 pt-4 text-sm text-muted-foreground">
            Emergency review reminders will appear here when the connected service supports them.
          </p>
          <AccessRequestList compact />
        </>
      )}
    </section>
  );
}

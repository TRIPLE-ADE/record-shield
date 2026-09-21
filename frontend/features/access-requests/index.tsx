"use client";

import { redirect } from "next/navigation";
import { useSession } from "@/hooks/auth";
import { ApiError } from "@/lib/api/client";
import { isTreatingPractitioner } from "@/utils/authorization";
import { AccessRequestList } from "./components/access-request-list";

export default function AccessRequestsPage() {
  const session = useSession();
  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  return (
    <main id="main-content" className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6 lg:px-10">
      <header>
        <p className="text-sm text-muted-foreground">Record sharing</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">Access requests</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Follow your requests and open records when access is approved.
        </p>
      </header>
      {session.isPending ? (
        <output>Loading your requests…</output>
      ) : session.data && isTreatingPractitioner(session.data.role) ? (
        <section className="rounded-xl border border-border bg-card">
          <AccessRequestList />
        </section>
      ) : (
        <p role="alert">
          Access requests are available to treating practitioners. Return home to continue.
        </p>
      )}
    </main>
  );
}

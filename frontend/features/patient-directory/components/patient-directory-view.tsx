"use client";

import { useEffect, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { SessionContext } from "@/lib/api/contracts/auth";
import { Input } from "@/components/ui/input";
import { usePatientDirectory } from "@/hooks/patients";
import { PatientDirectoryResults } from "./patient-directory-results";

export function PatientDirectoryView({ context }: { context: SessionContext }) {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSubmittedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const query = usePatientDirectory({
    scopeKey: `${context.user.id}:${context.organization?.organization_id ?? "none"}`,
    search: submittedSearch,
  });
  const patients = query.data?.pages.flatMap((page) => page.items) ?? [];
  const updating = search.trim() !== submittedSearch || query.isPending;
  return (
    <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-10">
      <header>
        <p className="text-sm text-muted-foreground">
          {context.organization?.name ?? "Patient care"}
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">My patients</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Find a patient in your current care assignment and open their records.
        </p>
      </header>
      <section
        aria-label="Patient directory"
        className="mt-6 overflow-hidden rounded-xl border border-border bg-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <label htmlFor="patient-directory-search" className="relative block w-full sm:max-w-sm">
            <span className="sr-only">Search patients</span>
            <MagnifyingGlassIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="patient-directory-search"
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by patient name or ID"
              className="h-10 pl-9"
            />
          </label>
          <output className="text-xs text-muted-foreground">
            {updating
              ? "Searching…"
              : query.error
                ? "List unavailable"
                : `${patients.length} shown${query.hasNextPage ? " · more available" : ""}`}
          </output>
        </div>
        <PatientDirectoryResults
          query={query}
          updating={updating}
          patients={patients}
          submittedSearch={submittedSearch}
          onClear={() => setSearch("")}
        />
      </section>
    </main>
  );
}

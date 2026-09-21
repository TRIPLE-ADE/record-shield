"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react";
import type { PatientDirectoryEntry } from "@/lib/api/contracts/patients";
import { formatUtcDate } from "@/utils/formatters";

export function PatientDirectoryCard({ patient }: { patient: PatientDirectoryEntry }) {
  return (
    <article className="group flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/8 text-sm font-semibold text-primary"
      >
        {patient.name
          .split(" ")
          .map((part) => part[0])
          .slice(0, 2)
          .join("")}
      </span>
      <div className="min-w-40 flex-1">
        <Link
          href={`/workspace/patients/${patient.patient_id}`}
          className="font-medium hover:text-primary hover:underline"
        >
          {patient.name}
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          {patient.local_patient_id} · Born {patient.date_of_birth}
        </p>
      </div>
      <div className="hidden min-w-40 text-xs text-muted-foreground lg:block">
        <p>{patient.organization.name}</p>
        <p className="mt-1">
          {patient.latest_encounter_at
            ? `Encounter ${formatUtcDate(patient.latest_encounter_at)}`
            : "No recent encounter"}
        </p>
      </div>
      <Link
        href={`/workspace/patients/${patient.patient_id}`}
        aria-label={`Open records for ${patient.name}`}
        className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-primary hover:bg-primary/5"
      >
        Open records
        <ArrowRightIcon aria-hidden="true" className="size-4" />
      </Link>
    </article>
  );
}

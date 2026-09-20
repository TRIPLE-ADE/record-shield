"use client";

import Link from "next/link";
import { ArrowLeftIcon, SirenIcon } from "@phosphor-icons/react";

export function EmergencyPageFrame({
  children,
  patientId,
}: {
  children: React.ReactNode;
  patientId: string;
}) {
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
        <span className="inline-flex items-center gap-2 rounded-full border border-emergency/25 bg-emergency/6 px-3 py-1.5 text-xs font-medium text-emergency">
          <SirenIcon aria-hidden="true" className="size-3.5" />
          Emergency access
        </span>
      </div>
      {children}
    </main>
  );
}

"use client";

import Link from "next/link";
import { ArrowLeftIcon, LinkSimpleIcon } from "@phosphor-icons/react";

export function ExchangeHeader({
  patientId,
  patientName,
  organizationName,
}: {
  patientId: string;
  patientName?: string;
  organizationName: string;
}) {
  return (
    <>
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
          <p className="mt-1 text-sm font-medium">{organizationName}</p>
        </div>
      </section>
    </>
  );
}

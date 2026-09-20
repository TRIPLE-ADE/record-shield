"use client";

import type { EmergencySession } from "@/lib/api/contracts/emergency";
import { formatEmergencyStatus } from "../utils/format";

export function EmergencyHeader({
  patientName,
  organizationName,
  session,
}: {
  patientName?: string;
  organizationName: string;
  session?: EmergencySession;
}) {
  return (
    <div className="flex flex-col justify-between gap-5 border-b border-border/70 pb-6 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emergency">
          Emergency review
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          {patientName ?? "Patient summary"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {organizationName} · bounded source disclosure
        </p>
      </div>
      {session ? (
        <div className="rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-right">
          <p className="text-xs text-muted-foreground">Session level</p>
          <p className="mt-1 text-sm font-semibold">
            Level {session.level} · {formatEmergencyStatus(session.status)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

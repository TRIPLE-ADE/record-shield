"use client";

import { CheckCircleIcon, SirenIcon } from "@phosphor-icons/react";
import type { EmergencySession } from "@/lib/api/contracts/emergency";
import { Card, CardContent } from "@/components/ui/card";
import { formatEmergencyReason, formatEmergencyRemaining } from "../utils/format";
import { TimerValue } from "./timer-value";

export function SessionNotice({ session }: { session: EmergencySession }) {
  const remaining = formatEmergencyRemaining(session.expires_at);
  const due = formatEmergencyRemaining(session.justification_due_at);
  const overdue = session.justification_status === "JUSTIFICATION_OVERDUE";
  return (
    <Card className="overflow-hidden border-emergency/30 bg-emergency/4">
      <div className="h-1 bg-emergency" />
      <CardContent className="space-y-4 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emergency/12 text-emergency">
              <SirenIcon aria-hidden="true" className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-base font-semibold">Emergency summary active</h2>
                <span className="rounded-full bg-emergency/12 px-2 py-1 text-xs font-semibold text-emergency">
                  Level {session.level}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatEmergencyReason(session.reason_code)} · every read is recorded
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
            <CheckCircleIcon aria-hidden="true" className="size-4" weight="duotone" />
            Audited
          </span>
        </div>
        <div className="grid gap-3 border-t border-emergency/15 pt-4 sm:grid-cols-2">
          <TimerValue label="Session expires" value={remaining} urgent />
          <TimerValue
            label="Clinical review"
            value={overdue ? "Overdue · expansion paused" : `Due in ${due}`}
            urgent={overdue}
          />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          The summary is deliberately incomplete. An item marked unknown does not mean the condition
          is absent.
        </p>
      </CardContent>
    </Card>
  );
}

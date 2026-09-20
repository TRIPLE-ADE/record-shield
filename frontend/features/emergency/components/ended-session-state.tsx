"use client";

import { ClockIcon } from "@phosphor-icons/react";
import type { EmergencySession } from "@/lib/api/contracts/emergency";
import { Button } from "@/components/ui/button";
import { EmergencyState } from "./emergency-state";

export function EndedSessionState({
  session,
  onReset,
}: {
  session?: EmergencySession;
  onReset: () => void;
}) {
  if (!session || (session.status !== "EXPIRED" && session.status !== "REVOKED")) return null;
  return (
    <EmergencyState
      icon={<ClockIcon aria-hidden="true" className="size-5" />}
      title={`Session ${session.status === "EXPIRED" ? "expired" : "revoked"}`}
      description="Protected reads are no longer available. A new session requires a fresh necessity confirmation."
      action={
        <Button type="button" variant="outline" onClick={onReset}>
          Start a new session
        </Button>
      }
    />
  );
}

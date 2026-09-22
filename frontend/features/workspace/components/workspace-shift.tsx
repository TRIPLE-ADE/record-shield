"use client";

import type { SessionContext } from "@/lib/api/contracts/auth";
import { formatTime } from "../utils/format";

export function WorkspaceShift({
  shift,
  username,
}: {
  shift: NonNullable<SessionContext["shift"]>;
  username: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <span className="font-medium">{shift.active ? "On duty" : "Off duty"}</span>
      <span className="text-muted-foreground">
        Shift {formatTime(shift.starts_at)} – {formatTime(shift.ends_at)}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">{username}</span>
    </div>
  );
}

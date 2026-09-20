"use client";

import { ClockIcon } from "@phosphor-icons/react";

export function TimerValue({
  label,
  value,
  urgent,
}: {
  label: string;
  value: string;
  urgent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-emergency/15 bg-background/50 p-3 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <ClockIcon aria-hidden="true" className="size-4" />
        {label}
      </span>
      <span
        className={`font-mono text-xs font-semibold tabular-nums ${urgent ? "text-emergency" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

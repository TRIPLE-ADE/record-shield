"use client";

import { useId } from "react";
import type { Encounter } from "@/lib/api/contracts/records";
import { formatUtcDate } from "@/utils/formatters";

export function VisitSelect({
  encounters,
  value,
  onChange,
  disabled = false,
  description = "Requests are linked to the visit selected here.",
}: {
  disabled?: boolean;
  description?: string;
  encounters: Encounter[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <label htmlFor={id} className="block text-sm font-medium">
        Current visit
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
      >
        {!encounters.some((item) => item.id === value) ? (
          <option value={value} disabled>
            Choose an open visit
          </option>
        ) : null}
        {encounters.map((encounter) => (
          <option key={encounter.id} value={encounter.id}>
            {encounter.type === "EMERGENCY" ? "Emergency visit" : "Routine visit"} ·{" "}
            {formatUtcDate(encounter.started_at)}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

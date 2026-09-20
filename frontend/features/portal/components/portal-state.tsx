"use client";

import { ShieldCheckIcon } from "@phosphor-icons/react";

export function PortalState({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-border bg-muted/40 ${compact ? "p-4" : "mx-auto mt-16 max-w-xl p-6"}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-primary ring-1 ring-border">
          <ShieldCheckIcon aria-hidden="true" className="size-4" weight="duotone" />
        </span>
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

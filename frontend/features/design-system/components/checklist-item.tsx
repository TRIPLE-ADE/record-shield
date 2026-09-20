"use client";

import { CheckIcon } from "@phosphor-icons/react";

export function ChecklistItem({ label, detail }: { label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success/12 text-success">
        <CheckIcon aria-hidden="true" className="size-3" weight="bold" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

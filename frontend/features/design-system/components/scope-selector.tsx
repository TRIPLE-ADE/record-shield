"use client";

import { useId } from "react";
import { useController, useFormContext } from "react-hook-form";
import { CheckIcon, LockKeyIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { SensitivityBadge, type Sensitivity } from "./sensitivity-badge";

type ScopeOption = {
  id: string;
  label: string;
  description: string;
  sensitivity: Sensitivity;
};

type ScopeSelectorProps = {
  options: ScopeOption[];
};

type ScopeFormValues = { domains: string[] };

export function ScopeSelector({ options }: ScopeSelectorProps) {
  const groupId = useId();
  const { control } = useFormContext<ScopeFormValues>();
  const { field } = useController({ name: "domains", control });
  const selected = Array.isArray(field.value) ? field.value : [];
  const selectedIds = new Set(selected);

  function toggleScope(id: string) {
    field.onChange(
      selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id],
    );
  }

  return (
    <fieldset className="space-y-3" aria-describedby={`${groupId}-hint`}>
      <legend className="text-sm font-semibold text-foreground">Requested domains</legend>
      <p id={`${groupId}-hint`} className="text-sm leading-6 text-muted-foreground">
        Start with the smallest useful scope. Restricted domains require explicit patient approval.
      </p>
      <div className="grid gap-2">
        {options.map((option) => {
          const isSelected = selectedIds.has(option.id);
          const isRestricted = option.sensitivity === "restricted";

          return (
            <label
              key={option.id}
              className={cn(
                "group flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-[border-color,background-color,box-shadow] hover:border-primary/35 hover:bg-muted/50",
                isSelected
                  ? "border-primary/50 bg-primary/5 shadow-sm"
                  : "border-border/80 bg-background/55",
              )}
            >
              <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-input bg-background group-has-focus-visible:ring-3 group-has-focus-visible:ring-ring/30">
                <input
                  type="checkbox"
                  name="requested-domains"
                  value={option.id}
                  checked={isSelected}
                  onChange={() => toggleScope(option.id)}
                  className="peer absolute inset-0 cursor-pointer opacity-0"
                />
                <CheckIcon
                  aria-hidden="true"
                  className="size-3.5 scale-0 text-primary transition-transform peer-checked:scale-100"
                  strokeWidth={3}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{option.label}</span>
                  <SensitivityBadge level={option.sensitivity} />
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {option.description}
                </span>
              </span>
              {isRestricted ? (
                <LockKeyIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 text-sensitivity-restricted"
                />
              ) : null}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {selected.length === 0
          ? "No domains selected yet."
          : `${selected.length} domain${selected.length === 1 ? "" : "s"} selected.`}
      </p>
    </fieldset>
  );
}

export type { ScopeOption };

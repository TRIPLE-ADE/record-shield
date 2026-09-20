"use client";

import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useDesignSystemPreview } from "../state/preview-context";
import { previewStates } from "../data/preview";

export function StatePicker() {
  const { form } = useDesignSystemPreview();
  const state = useWatch({ control: form.control, name: "state" }) ?? "ready";

  return (
    <fieldset className="flex flex-wrap gap-1 rounded-lg bg-background p-1 ring-1 ring-border/80">
      <legend className="sr-only">Choose a data state</legend>
      {previewStates.map((option) => (
        <Button
          key={option.kind}
          type="button"
          variant={state === option.kind ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={state === option.kind}
          onClick={() => form.setValue("state", option.kind, { shouldDirty: true })}
        >
          {option.label}
        </Button>
      ))}
    </fieldset>
  );
}

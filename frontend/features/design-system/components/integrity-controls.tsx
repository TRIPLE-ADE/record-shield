"use client";

import { useWatch } from "react-hook-form";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { IntegrityIndicator } from "./integrity-indicator";
import { useDesignSystemPreview } from "../state/preview-context";
import { integrityDescriptions } from "../data/preview";

export function IntegrityControls() {
  const { form } = useDesignSystemPreview();
  const integrity = useWatch({ control: form.control, name: "integrity" }) ?? "verified";

  return (
    <>
      <IntegrityIndicator state={integrity} descriptions={integrityDescriptions} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => form.setValue("integrity", "verified", { shouldDirty: true })}
        >
          <CheckCircleIcon aria-hidden="true" /> Verify chain
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => form.setValue("integrity", "invalid", { shouldDirty: true })}
        >
          Simulate failure
        </Button>
      </div>
    </>
  );
}

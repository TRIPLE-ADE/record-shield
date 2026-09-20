"use client";

import { getEmergencyErrorMessage } from "../utils/format";

export function InlineError({ error }: { error: Error }) {
  return (
    <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
      {getEmergencyErrorMessage(error)}
    </p>
  );
}

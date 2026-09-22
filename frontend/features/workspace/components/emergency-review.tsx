"use client";

import { LoadingRows } from "@/components/loading-rows";

import { useEmergencyStatus } from "@/hooks/emergency";
import { JustificationCard } from "@/features/emergency/components/justification-card";
import { Button } from "@/components/ui/button";

export function EmergencyReview({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const status = useEmergencyStatus(sessionId);
  return (
    <section className="mt-4 space-y-3" aria-label="Emergency access review">
      <Button variant="ghost" size="sm" onClick={onClose}>
        Close review
      </Button>
      {status.error ? (
        <p role="alert" className="text-sm text-destructive">
          This review could not be loaded. Close it and try again.
        </p>
      ) : status.isPending ? (
        <LoadingRows label="Loading review…" rows={1} />
      ) : status.data?.session.justification_status === "SUBMITTED" ? (
        <output className="text-sm">Your clinical review has been recorded.</output>
      ) : status.data ? (
        <JustificationCard session={status.data.session} />
      ) : null}
    </section>
  );
}

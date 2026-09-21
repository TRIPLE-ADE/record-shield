"use client";

import type { Encounter } from "@/lib/api/contracts/records";
import { VisitSelect } from "@/components/visit-select";
import { Button } from "@/components/ui/button";

export function CareVisitPanel({
  encounters,
  selectedId,
  loading,
  error,
  onRetry,
  onSelect,
  saving,
  connected,
}: {
  encounters: Encounter[];
  selectedId: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onSelect: (id: string) => void;
  saving: boolean;
  connected: boolean;
}) {
  return (
    <section className="mt-5 space-y-3" aria-label="Visit and documentation">
      <p className="text-sm text-muted-foreground">
        {connected
          ? "These records come from your hospital’s connected record system. Update them in that system."
          : "Record care in this hospital. New entries are saved to the selected visit with your name and the time recorded."}
      </p>
      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
          <p role="alert" className="text-sm">
            We couldn’t verify the current visits. New entries are unavailable until visits can be
            checked.
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry visits
          </Button>
        </div>
      ) : loading ? (
        <output className="block text-sm text-muted-foreground">Loading current visits…</output>
      ) : encounters.length ? (
        <VisitSelect
          encounters={encounters}
          value={selectedId}
          onChange={onSelect}
          disabled={saving}
          description="Record history below includes all available visits. New entries use the visit selected here."
        />
      ) : (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No open visit. You can review available history, but new entries require an open visit.
        </p>
      )}
      {!loading &&
      !error &&
      selectedId &&
      encounters.length > 0 &&
      !encounters.some((item) => item.id === selectedId) ? (
        <p role="alert" className="text-sm text-destructive">
          The selected visit is no longer available. Choose an open visit before adding care.
        </p>
      ) : null}
    </section>
  );
}

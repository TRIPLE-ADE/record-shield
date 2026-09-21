"use client";

import Link from "next/link";
import { useState } from "react";
import { useWorklist } from "@/hooks/worklist";
import { useCurrentTime } from "@/hooks/use-current-time";
import { Button } from "@/components/ui/button";
import { formatUtcDate } from "@/utils/formatters";
import { EmergencyReview } from "./emergency-review";

const labels = {
  REQUEST_PENDING: "Waiting for patient consent",
  RECORDS_READY: "Records ready to view",
  EMERGENCY_REVIEW: "Emergency review needed",
};

export function ActionQueue() {
  const queue = useWorklist();
  const now = useCurrentTime();
  const [reviewId, setReviewId] = useState("");
  if (queue.error)
    return (
      <div className="space-y-3 p-5">
        <p role="alert" className="text-sm">
          We couldn’t load your outstanding actions.
        </p>
        <Button variant="outline" size="sm" onClick={() => queue.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (queue.isPending)
    return <output className="p-5 text-sm text-muted-foreground">Loading your actions…</output>;
  const items = Array.from(
    new Map(queue.data.pages.flatMap((page) => page.items).map((item) => [item.id, item])).values(),
  );
  return (
    <div className="p-5">
      {items.length ? (
        <ul className="divide-y divide-border" aria-label="Outstanding actions">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0"
            >
              <div>
                <p className="text-sm font-medium">{item.patient_name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{labels[item.type]}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.type === "EMERGENCY_REVIEW"
                    ? new Date(item.due_at).getTime() <= now
                      ? "Overdue since"
                      : "Due"
                    : "Expires"}{" "}
                  {formatUtcDate(item.due_at)}
                </p>
              </div>
              {item.type === "EMERGENCY_REVIEW" ? (
                <Button variant="outline" size="sm" onClick={() => setReviewId(item.id)}>
                  Write review
                </Button>
              ) : (
                <Link
                  href={`/workspace/patients/${item.patient_id}/exchange`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {item.type === "RECORDS_READY" ? "View records" : "View request"}
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          You’re up to date. Requests and emergency reviews will appear here.
        </p>
      )}
      {queue.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          disabled={queue.isFetchingNextPage}
          onClick={() => queue.fetchNextPage()}
        >
          {queue.isFetchingNextPage ? "Loading…" : "Load more actions"}
        </Button>
      ) : null}
      {reviewId ? (
        <EmergencyReview key={reviewId} sessionId={reviewId} onClose={() => setReviewId("")} />
      ) : null}
    </div>
  );
}

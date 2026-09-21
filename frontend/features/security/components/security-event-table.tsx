import { ListChecksIcon } from "@phosphor-icons/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AuditEvent } from "@/lib/api/contracts/security";
import { eventDecisionLabel, formatIdentifier, formatSecurityTime } from "../utils/format";

export function SecurityEventTable({ events }: { events: AuditEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecksIcon aria-hidden="true" className="size-4 text-primary" weight="duotone" />{" "}
          Stream activity
        </CardTitle>
        <CardDescription>
          Ordered audit metadata with correlation and sequence references.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No events match the current filters.
          </p>
        ) : (
          <div className="divide-y divide-border/70">
            {events.map((event) => (
              <div
                key={event.event_id}
                className="grid gap-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="grid size-7 place-items-center rounded-full bg-muted font-medium text-foreground">
                    {event.sequence}
                  </span>
                  <span>{formatSecurityTime(event.occurred_at)}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {event.reason_code.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {event.action} · actor {formatIdentifier(event.actor_id)} · correlation{" "}
                    {formatIdentifier(event.correlation_id)} · source{" "}
                    {formatIdentifier(event.source_org)}
                  </p>
                </div>
                <Badge
                  variant={
                    event.decision === "DENY"
                      ? "destructive"
                      : event.decision === "ALLOW"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {eventDecisionLabel(event)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

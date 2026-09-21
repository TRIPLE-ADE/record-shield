import { WarningIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertReviewDialog } from "./alert-review-dialog";
import type { SecurityAlert } from "@/lib/api/contracts/security";
import { alertStatusLabel, formatIdentifier, formatSecurityTime } from "../utils/format";

export function SecurityAlertTable({
  alerts,
  canReview,
}: {
  alerts: SecurityAlert[];
  canReview: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WarningIcon aria-hidden="true" className="size-4 text-amber-600" weight="duotone" />{" "}
          Alert queue
        </CardTitle>
        <CardDescription>
          Deterministic rule matches with metadata needed for review.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No alerts match the current filters.
          </p>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <article key={alert.id} className="rounded-xl border border-border/80 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={alert.severity === "CRITICAL" ? "destructive" : "outline"}>
                        {alert.severity}
                      </Badge>
                      <Badge variant="outline">{alert.rule_id}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {alertStatusLabel(alert)}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-foreground">
                      {alert.reason_code.replaceAll("_", " ")}
                    </h3>
                    <dl className="mt-2 grid gap-x-5 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                      <div>
                        <dt className="sr-only">Actor</dt>
                        <dd>Actor {formatIdentifier(alert.actor_id)}</dd>
                      </div>
                      <div>
                        <dt className="sr-only">Patient reference</dt>
                        <dd>Patient ref {formatIdentifier(alert.patient_ref)}</dd>
                      </div>
                      <div>
                        <dt className="sr-only">Created</dt>
                        <dd>{formatSecurityTime(alert.created_at)}</dd>
                      </div>
                      <div>
                        <dt className="sr-only">Organization</dt>
                        <dd>Org {formatIdentifier(alert.organization_id)}</dd>
                      </div>
                      <div>
                        <dt className="sr-only">Reviewer</dt>
                        <dd>Reviewer {formatIdentifier(alert.reviewer_id)}</dd>
                      </div>
                    </dl>
                  </div>
                  {canReview &&
                  alert.status !== "RESOLVED_LEGITIMATE" &&
                  alert.status !== "RESOLVED_SUSPECTED_MISUSE" ? (
                    <AlertReviewDialog alert={alert} />
                  ) : null}
                </div>
                {alert.resolution ? (
                  <p className="mt-3 border-t border-border/70 pt-3 text-sm text-muted-foreground">
                    {alert.resolution}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { ActivityIcon, BellRingingIcon, CheckCircleIcon, WarningIcon } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SecuritySummary({
  eventCount,
  alertCount,
  criticalCount,
  chainStatus,
}: {
  eventCount: number;
  alertCount: number;
  criticalCount: number;
  chainStatus: "idle" | "pending" | "valid" | "invalid" | "unknown";
}) {
  const chainLabel =
    chainStatus === "pending"
      ? "Checking"
      : chainStatus === "valid"
        ? "Verified"
        : chainStatus === "invalid"
          ? "Needs review"
          : chainStatus === "unknown"
            ? "Unknown"
            : "Not checked";
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card size="sm">
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Events
            </p>
            <p className="mt-2 font-heading text-2xl font-semibold">{eventCount}</p>
          </div>
          <ActivityIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Open alerts
            </p>
            <p className="mt-2 font-heading text-2xl font-semibold">{alertCount}</p>
          </div>
          <BellRingingIcon aria-hidden="true" className="size-5 text-amber-600" weight="duotone" />
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Critical
            </p>
            <p className="mt-2 font-heading text-2xl font-semibold">{criticalCount}</p>
          </div>
          <WarningIcon aria-hidden="true" className="size-5 text-destructive" weight="duotone" />
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Chain
            </p>
            <div className="mt-2">
              <Badge
                variant={
                  chainStatus === "invalid"
                    ? "destructive"
                    : chainStatus === "valid"
                      ? "secondary"
                      : "outline"
                }
              >
                {chainLabel}
              </Badge>
            </div>
          </div>
          <CheckCircleIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
        </CardContent>
      </Card>
    </div>
  );
}

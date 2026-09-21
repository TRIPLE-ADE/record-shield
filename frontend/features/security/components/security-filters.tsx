import { FunnelIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SecurityAlertFilters, SecurityEventFilters } from "@/features/security/api";

export function SecurityFilters({
  view,
  eventFilters,
  alertFilters,
  onEventFiltersChange,
  onAlertFiltersChange,
  onReset,
}: {
  view: "alerts" | "events";
  eventFilters: SecurityEventFilters;
  alertFilters: SecurityAlertFilters;
  onEventFiltersChange: (filters: SecurityEventFilters) => void;
  onAlertFiltersChange: (filters: SecurityAlertFilters) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/25 p-2">
      <span className="inline-flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
        <FunnelIcon aria-hidden="true" className="size-3.5" />
        Filter
      </span>
      {view === "alerts" ? (
        <>
          <Input
            aria-label="Alert actor"
            className="h-8 w-40 text-xs"
            placeholder="Actor ID"
            value={alertFilters.actorId ?? ""}
            onChange={(event) =>
              onAlertFiltersChange({ ...alertFilters, actorId: event.target.value || undefined })
            }
          />
          <Select
            value={alertFilters.ruleId ?? "all"}
            onValueChange={(value) =>
              onAlertFiltersChange({
                ...alertFilters,
                ruleId: value === "all" ? undefined : value,
              })
            }
          >
            <SelectTrigger aria-label="Alert rule" className="w-28">
              <SelectValue placeholder="Rule" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rules</SelectItem>
              {Array.from({ length: 9 }, (_, index) => `AR0${index + 1}`).map((rule) => (
                <SelectItem key={rule} value={rule}>
                  {rule}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={alertFilters.severity ?? "all"}
            onValueChange={(value) =>
              onAlertFiltersChange({
                ...alertFilters,
                severity: value === "all" ? undefined : (value as SecurityAlertFilters["severity"]),
              })
            }
          >
            <SelectTrigger aria-label="Alert severity" className="w-32">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severity</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={alertFilters.status ?? "all"}
            onValueChange={(value) =>
              onAlertFiltersChange({
                ...alertFilters,
                status: value === "all" ? undefined : (value as SecurityAlertFilters["status"]),
              })
            }
          >
            <SelectTrigger aria-label="Alert status" className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="REVIEW_REQUIRED">Needs review</SelectItem>
              <SelectItem value="IN_REVIEW">In review</SelectItem>
              <SelectItem value="RESOLVED_LEGITIMATE">Legitimate</SelectItem>
              <SelectItem value="RESOLVED_SUSPECTED_MISUSE">Suspected misuse</SelectItem>
            </SelectContent>
          </Select>
        </>
      ) : (
        <>
          <Input
            aria-label="Event actor"
            className="h-8 w-40 text-xs"
            placeholder="Actor ID"
            value={eventFilters.actorId ?? ""}
            onChange={(event) =>
              onEventFiltersChange({ ...eventFilters, actorId: event.target.value || undefined })
            }
          />
          <Select
            value={eventFilters.eventType ?? "all"}
            onValueChange={(value) =>
              onEventFiltersChange({
                ...eventFilters,
                eventType: value === "all" ? undefined : value,
              })
            }
          >
            <SelectTrigger aria-label="Event type" className="w-36">
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All event types</SelectItem>
              <SelectItem value="DISCLOSURE">Disclosure</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={eventFilters.decision ?? "all"}
            onValueChange={(value) =>
              onEventFiltersChange({
                ...eventFilters,
                decision: value === "all" ? undefined : (value as SecurityEventFilters["decision"]),
              })
            }
          >
            <SelectTrigger aria-label="Event decision" className="w-36">
              <SelectValue placeholder="Decision" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All decisions</SelectItem>
              <SelectItem value="ALLOW">Allowed</SelectItem>
              <SelectItem value="DENY">Denied</SelectItem>
              <SelectItem value="NOT_APPLICABLE">Recorded</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}
      <Button variant="ghost" size="sm" onClick={onReset}>
        <XIcon aria-hidden="true" />
        Reset
      </Button>
    </div>
  );
}

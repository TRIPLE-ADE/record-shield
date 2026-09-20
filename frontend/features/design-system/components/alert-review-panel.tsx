import { WarningIcon, CheckIcon, ClockIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./status-badge";

type AlertReviewPanelProps = {
  alert: {
    title: string;
    severity: string;
    description: string;
    age: string;
    reviewed: boolean;
  };
  reviewed: boolean;
  onReview: () => void;
};

export function AlertReviewPanel({ alert, reviewed, onReview }: AlertReviewPanelProps) {
  return (
    <div className="rounded-xl border border-severity-high/25 bg-severity-high/6 p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-severity-high/12 text-severity-high">
          <WarningIcon aria-hidden="true" className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{alert.title}</p>
            <StatusBadge tone={reviewed ? "success" : "warning"}>
              {reviewed ? "Reviewed" : alert.severity}
            </StatusBadge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{alert.description}</p>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ClockIcon aria-hidden="true" className="size-3.5" />
              {alert.age}
            </span>
            <Button
              variant={reviewed ? "secondary" : "outline"}
              size="sm"
              onClick={onReview}
              disabled={reviewed}
            >
              {reviewed ? <CheckIcon aria-hidden="true" /> : null}
              {reviewed ? "Review recorded" : "Review alert"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

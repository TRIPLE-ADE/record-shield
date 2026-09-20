import {
  CheckCircleIcon,
  CircleDashedIcon,
  ClockIcon,
  FileMagnifyingGlassIcon,
  LockKeyIcon,
  CloudSlashIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusTone } from "./status-badge";

type DataStateKind = "ready" | "empty" | "denied" | "unavailable" | "expired";

const stateConfig: Record<
  DataStateKind,
  { label: string; tone: StatusTone; icon: typeof CheckCircleIcon }
> = {
  ready: { label: "Ready", tone: "success", icon: CheckCircleIcon },
  empty: { label: "No records", tone: "neutral", icon: FileMagnifyingGlassIcon },
  denied: { label: "Access denied", tone: "critical", icon: LockKeyIcon },
  unavailable: { label: "Source unavailable", tone: "warning", icon: CloudSlashIcon },
  expired: { label: "Scope expired", tone: "emergency", icon: ClockIcon },
};

type DataStateProps = {
  kind: DataStateKind;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
};

export function DataState({ kind, title, description, action, className }: DataStateProps) {
  const { icon: Icon, label, tone } = stateConfig[kind];

  return (
    <div
      aria-live="polite"
      className={cn("rounded-xl border border-dashed border-border bg-muted/45 p-4", className)}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground ring-1 ring-border">
          <Icon aria-hidden="true" className="size-4" />
        </div>
        <div className="min-w-0 space-y-1">
          <StatusBadge tone={tone} icon={CircleDashedIcon}>
            {label}
          </StatusBadge>
          <p className="font-medium text-foreground">{title}</p>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
          {action ? <div className="pt-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export type { DataStateKind };

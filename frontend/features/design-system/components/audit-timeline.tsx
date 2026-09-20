import { CheckCircle, WarningCircle, Eye, ShieldCheck } from "@phosphor-icons/react";
import { StatusBadge } from "./status-badge";

type AuditEvent = {
  id: string;
  time: string;
  title: string;
  detail: string;
  kind: "emergency" | "success" | "critical";
};

const eventPresentation = {
  emergency: { tone: "emergency" as const, icon: Eye },
  success: { tone: "success" as const, icon: CheckCircle },
  critical: { tone: "critical" as const, icon: WarningCircle },
};

export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  return (
    <ol className="space-y-4" aria-label="Recent audit events">
      {events.map((event, index) => {
        const presentation = eventPresentation[event.kind];
        const Icon = presentation.icon;

        return (
          <li key={event.title} className="relative flex gap-3">
            {index < events.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute top-7 left-3.5 h-[calc(100%+0.5rem)] w-px bg-border"
              />
            ) : null}
            <div className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-background ring-1 ring-border">
              <Icon aria-hidden="true" className="size-3.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{event.title}</p>
                <time className="font-mono text-[0.68rem] tabular-nums text-muted-foreground">
                  {event.time}
                </time>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-xs text-muted-foreground">{event.detail}</p>
                <StatusBadge tone={presentation.tone} icon={ShieldCheck}>
                  Logged
                </StatusBadge>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

import { TimerIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type ExpiryTimerProps = {
  label?: string;
  value: string;
  progress?: number;
  urgent?: boolean;
};

export function ExpiryTimer({
  label = "Scope expires",
  value,
  progress = 68,
  urgent = false,
}: ExpiryTimerProps) {
  return (
    <div className="space-y-2" aria-label={`${label}: ${value}`}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <TimerIcon aria-hidden="true" className="size-3.5" />
          {label}
        </span>
        <time
          className={cn(
            "font-mono font-semibold tabular-nums",
            urgent ? "text-emergency" : "text-foreground",
          )}
        >
          {value}
        </time>
      </div>
      <progress
        className={cn(
          "h-1.5 w-full overflow-hidden rounded-full bg-muted align-top [appearance:none] [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full",
          urgent
            ? "[accent-color:var(--emergency)] [&::-moz-progress-bar]:bg-emergency [&::-webkit-progress-value]:bg-emergency"
            : "[accent-color:var(--primary)] [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-value]:bg-primary",
        )}
        value={progress}
        max={100}
        aria-label={`${label}: ${value}`}
      />
    </div>
  );
}

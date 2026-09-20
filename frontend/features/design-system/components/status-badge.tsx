import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "success" | "warning" | "info" | "emergency" | "critical";

const toneClasses: Record<StatusTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/15 text-warning-foreground",
  info: "border-info/20 bg-info/10 text-info",
  emergency: "border-emergency/25 bg-emergency/10 text-emergency",
  critical: "border-severity-critical/25 bg-severity-critical/10 text-severity-critical",
};

type StatusBadgeProps = {
  children: React.ReactNode;
  tone?: StatusTone;
  icon?: Icon;
  className?: string;
};

export function StatusBadge({
  children,
  tone = "neutral",
  icon: Icon,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold tracking-[0.02em]",
        toneClasses[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3.5" weight="duotone" /> : null}
      <span>{children}</span>
    </span>
  );
}

export type { StatusTone };

import { CheckCircleIcon, QuestionIcon, ShieldWarningIcon } from "@phosphor-icons/react";
import { StatusBadge } from "./status-badge";

type IntegrityState = "verified" | "unknown" | "invalid";

const states: Record<
  IntegrityState,
  {
    label: string;
    description: string;
    icon: typeof CheckCircleIcon;
    tone: "success" | "warning" | "critical";
  }
> = {
  verified: {
    label: "Verified",
    description: "Hash links match the checkpoint",
    icon: CheckCircleIcon,
    tone: "success",
  },
  unknown: {
    label: "Unknown",
    description: "Verification has not run yet",
    icon: QuestionIcon,
    tone: "warning",
  },
  invalid: {
    label: "Integrity failure",
    description: "Sequence 18 does not match",
    icon: ShieldWarningIcon,
    tone: "critical",
  },
};

type IntegrityIndicatorProps = {
  state: IntegrityState;
  descriptions: Record<IntegrityState, string>;
};

export function IntegrityIndicator({ state, descriptions }: IntegrityIndicatorProps) {
  const config = states[state];
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </div>
      <div className="min-w-0 space-y-1">
        <StatusBadge tone={config.tone} icon={Icon}>
          {config.label}
        </StatusBadge>
        <p className="text-xs leading-5 text-muted-foreground">{descriptions[state]}</p>
      </div>
    </div>
  );
}

export type { IntegrityState };

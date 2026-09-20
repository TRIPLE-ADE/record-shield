import { LockKey, ShieldCheck, ShieldWarning } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type Sensitivity = "standard" | "sensitive" | "restricted";

const sensitivityConfig: Record<
  Sensitivity,
  { label: string; description: string; icon: typeof ShieldCheck; className: string }
> = {
  standard: {
    label: "Standard",
    description: "Available within ordinary policy scope",
    icon: ShieldCheck,
    className:
      "border-sensitivity-standard/25 bg-sensitivity-standard/10 text-sensitivity-standard",
  },
  sensitive: {
    label: "Sensitive",
    description: "Requires role and assignment checks",
    icon: ShieldWarning,
    className:
      "border-sensitivity-sensitive/25 bg-sensitivity-sensitive/10 text-sensitivity-sensitive",
  },
  restricted: {
    label: "Restricted",
    description: "Requires explicit domain permission",
    icon: LockKey,
    className:
      "border-sensitivity-restricted/25 bg-sensitivity-restricted/10 text-sensitivity-restricted",
  },
};

type SensitivityBadgeProps = {
  level: Sensitivity;
  showDescription?: boolean;
};

export function SensitivityBadge({ level, showDescription = false }: SensitivityBadgeProps) {
  const config = sensitivityConfig[level];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold",
        config.className,
      )}
      title={config.description}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {config.label}
      {showDescription ? (
        <span className="font-normal opacity-80">· {config.description}</span>
      ) : null}
    </span>
  );
}

export type { Sensitivity };

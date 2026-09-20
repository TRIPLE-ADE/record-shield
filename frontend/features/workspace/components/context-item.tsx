"use client";

export function ContextItem({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

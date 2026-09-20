"use client";

export function TokenSwatch({
  label,
  variable,
  className,
}: {
  label: string;
  variable: string;
  className: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`size-7 rounded-lg ring-1 ring-black/8 ${className}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="truncate font-mono text-[0.65rem] text-muted-foreground">{variable}</p>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

export function TrustNote({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/65 bg-card/55 p-3.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{copy}</span>
      </span>
    </div>
  );
}

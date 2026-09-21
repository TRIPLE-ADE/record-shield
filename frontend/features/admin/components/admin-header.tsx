import Link from "next/link";
import { ArrowLeftIcon, GearSixIcon } from "@phosphor-icons/react";

export function AdminHeader({ organizationName }: { organizationName?: string }) {
  return (
    <header className="flex flex-col gap-5 border-b border-border/70 pb-7">
      <Link
        href="/workspace/security"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        Security evidence
      </Link>
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <GearSixIcon aria-hidden="true" className="size-6" weight="duotone" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {organizationName ?? "Trust network"}
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Administration
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage staff assignments, emergency access policies, and account access for your
            hospital.
          </p>
        </div>
      </div>
    </header>
  );
}

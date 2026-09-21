import Link from "next/link";
import { ArrowUpRightIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import type { Role } from "@/lib/api/contracts/auth";

export function SecurityHeader({
  role,
  organizationName,
}: {
  role: Role | null;
  organizationName?: string;
}) {
  const isTrustOperator = role === "TRUST_OPERATOR";
  return (
    <header className="flex flex-col gap-6 border-b border-border/70 pb-7 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-muted/45 px-3 py-1 text-xs font-medium text-muted-foreground">
          <ShieldCheckIcon aria-hidden="true" className="size-3.5 text-primary" weight="duotone" />
          {isTrustOperator ? "Exchange stream" : (organizationName ?? "Local stream")}
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Security evidence
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Review the decisions and alerts for the stream you are authorized to oversee.
        </p>
      </div>
      {role === "SECURITY_ADMIN" || role === "TRUST_OPERATOR" ? (
        <Link
          href="/workspace/security/admin"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline hover:underline-offset-4"
        >
          {role === "TRUST_OPERATOR" ? "Suspension controls" : "Administration"}
          <ArrowUpRightIcon aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </header>
  );
}

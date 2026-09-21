"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClockCountdownIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  StackIcon,
  ArrowsLeftRightIcon,
  GearIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { WorkspaceHeader } from "@/features/auth/components/workspace-header";
import { useSession } from "@/hooks/auth";
import { isTreatingPractitioner } from "@/utils/authorization";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: context } = useSession();
  const security = context?.role === "SECURITY_ADMIN" || context?.role === "TRUST_OPERATOR";
  const navigation = [
    { label: "Home", href: "/workspace", icon: SquaresFourIcon, visible: true },
    {
      label: "Patients",
      href: "/workspace/patients",
      icon: StackIcon,
      visible: context?.permissions_summary.includes("local_records.read_with_context"),
    },
    {
      label: "Access requests",
      href: "/workspace/requests",
      icon: ArrowsLeftRightIcon,
      visible: isTreatingPractitioner(context?.role ?? null),
    },
    { label: "Security", href: "/workspace/security", icon: ShieldCheckIcon, visible: security },
    {
      label: "Administration",
      href: "/workspace/security/admin",
      icon: GearIcon,
      visible: security,
    },
    {
      label: "Downtime",
      href: "/workspace/downtime",
      icon: ClockCountdownIcon,
      visible: context?.role === "SECURITY_ADMIN",
    },
  ].filter((item) => item.visible);
  const links = navigation.map((item) => {
    const active =
      pathname === item.href ||
      (item.href !== "/workspace" &&
        pathname.startsWith(item.href + "/") &&
        !navigation.some(
          (other) =>
            other.href !== item.href &&
            other.href.startsWith(item.href + "/") &&
            pathname.startsWith(other.href),
        ));
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon aria-hidden="true" className="size-4" weight={active ? "duotone" : "regular"} />
        {item.label}
      </Link>
    );
  });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
          <div className="sticky top-0 flex h-screen flex-col">
            <Link
              href="/workspace"
              className="flex items-center gap-3 px-6 py-7"
              aria-label="RecordShield home"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                <ShieldCheckIcon aria-hidden="true" className="size-5" weight="duotone" />
              </span>
              <span className="font-heading text-base font-semibold tracking-tight">
                RecordShield
              </span>
            </Link>
            <nav aria-label="Main navigation" className="space-y-1 px-3 py-4">
              {links}
            </nav>
            <div className="mt-auto border-t border-sidebar-border px-6 py-5">
              <p className="text-xs font-medium">Care, connected.</p>
              <p className="mt-1 text-xs leading-5 text-sidebar-foreground/55">
                The right records. Accountable access.
              </p>
            </div>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <WorkspaceHeader />
          <nav
            aria-label="Mobile navigation"
            className="flex gap-1 overflow-x-auto bg-sidebar p-2 text-sidebar-foreground md:hidden"
          >
            {links}
          </nav>
          {children}
        </div>
      </div>
    </div>
  );
}

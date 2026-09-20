"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheckIcon, SquaresFourIcon, StackIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { WorkspaceHeader } from "@/features/auth/components/workspace-header";
import { useSession } from "@/hooks/auth";

type WorkspaceShellProps = {
  children: ReactNode;
};

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  const pathname = usePathname();
  const session = useSession();
  const patientRecordsHref = session.data?.patient_id
    ? `/workspace/patients/${session.data.patient_id}`
    : undefined;
  const navigation = [
    { label: "Overview", href: "/workspace", icon: SquaresFourIcon, disabled: false },
    {
      label: "Patient records",
      href: patientRecordsHref,
      icon: StackIcon,
      disabled: !patientRecordsHref,
    },
    { label: "Security evidence", href: undefined, icon: ShieldCheckIcon, disabled: true },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
          <div className="px-6 py-7">
            <Link href="/workspace" className="flex items-center gap-3" aria-label="Workspace home">
              <span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                <ShieldCheckIcon aria-hidden="true" className="size-5" weight="duotone" />
              </span>
              <span>
                <span className="block font-heading text-sm font-semibold tracking-tight">
                  RecordShield
                </span>
                <span className="block text-[0.65rem] uppercase tracking-[0.18em] text-sidebar-foreground/55">
                  Protected workspace
                </span>
              </span>
            </Link>
          </div>

          <div className="border-t border-sidebar-border px-3 py-6">
            <p className="px-3 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">
              Workspace
            </p>
            <nav aria-label="Workspace navigation" className="space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = Boolean(
                  item.href &&
                  (pathname === item.href ||
                    (item.label === "Patient records" && pathname.startsWith(item.href))),
                );
                const content = (
                  <>
                    <Icon
                      aria-hidden="true"
                      className="size-4"
                      weight={isActive ? "duotone" : "regular"}
                    />
                    <span>{item.label}</span>
                    {item.disabled ? (
                      <span className="ml-auto text-[0.6rem] uppercase tracking-[0.12em] text-sidebar-foreground/35">
                        Next
                      </span>
                    ) : null}
                  </>
                );

                return item.disabled || !item.href ? (
                  <span
                    key={item.label}
                    className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/40"
                    aria-disabled="true"
                  >
                    {content}
                  </span>
                ) : (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70",
                    )}
                  >
                    {content}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <WorkspaceHeader />
          {children}
        </div>
      </div>
    </div>
  );
}

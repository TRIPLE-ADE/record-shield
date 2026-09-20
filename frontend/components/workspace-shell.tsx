"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  HouseIcon,
  LifebuoyIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  StackIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { WorkspaceHeader } from "@/features/auth/components/workspace-header";

type WorkspaceShellProps = {
  children: ReactNode;
};

const navigation = [
  { label: "Overview", href: "/workspace", icon: SquaresFourIcon },
  { label: "Patient records", href: "#records", icon: StackIcon, disabled: true },
  { label: "Security evidence", href: "#security", icon: ShieldCheckIcon, disabled: true },
];

export function WorkspaceShell({ children }: WorkspaceShellProps) {
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
              {navigation.map((item, index) => {
                const Icon = item.icon;
                const content = (
                  <>
                    <Icon
                      aria-hidden="true"
                      className="size-4"
                      weight={index === 0 ? "duotone" : "regular"}
                    />
                    <span>{item.label}</span>
                    {item.disabled ? (
                      <span className="ml-auto text-[0.6rem] uppercase tracking-[0.12em] text-sidebar-foreground/35">
                        Next
                      </span>
                    ) : null}
                  </>
                );

                return item.disabled ? (
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
                      index === 0
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

          <div className="mt-auto space-y-3 p-4">
            <Link
              href="/design-system"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LifebuoyIcon aria-hidden="true" className="size-3.5" />
              Component reference
              <ArrowUpRightIcon aria-hidden="true" className="ml-auto size-3.5" />
            </Link>
            <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3">
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="size-2 rounded-full bg-sidebar-primary" />
                Synthetic environment
              </div>
              <p className="mt-2 text-xs leading-5 text-sidebar-foreground/55">
                Context-backed preview · no live patient data
              </p>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <WorkspaceHeader />
          <div className="border-b border-border/60 bg-primary/4.5 px-4 py-2.5 sm:px-6 lg:px-10">
            <div className="mx-auto flex max-w-7xl items-center gap-2 text-xs text-muted-foreground">
              <HouseIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-primary"
                weight="duotone"
              />
              <span>
                <span className="font-semibold text-foreground">Synthetic workspace</span> ·
                server-derived context
              </span>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

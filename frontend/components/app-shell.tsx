"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  PulseIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  StackIcon,
} from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
};

const navigation = [
  { label: "Overview", href: "#overview", icon: SquaresFourIcon },
  { label: "Foundations", href: "#foundations", icon: SlidersHorizontalIcon },
  { label: "Components", href: "#components", icon: StackIcon },
  { label: "States", href: "#states", icon: PulseIcon },
  { label: "Patterns", href: "#patterns", icon: ShieldIcon },
];

export function AppShell({ children }: AppShellProps) {
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
            <Link href="/" className="flex items-center gap-3" aria-label="RecordShield home">
              <span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                <ShieldIcon aria-hidden="true" className="size-5" weight="duotone" />
              </span>
              <span>
                <span className="block font-heading text-sm font-semibold tracking-tight">
                  RecordShield
                </span>
                <span className="block text-[0.65rem] uppercase tracking-[0.18em] text-sidebar-foreground/55">
                  Clinical trust layer
                </span>
              </span>
            </Link>
          </div>

          <div className="border-t border-sidebar-border px-3 py-6">
            <p className="px-3 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">
              Design system
            </p>
            <nav aria-label="Design system navigation" className="space-y-1">
              {navigation.map((item, index) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.label}
                    href={`/design-system${item.href}`}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      index === 0
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className="size-4"
                      weight={index === 0 ? "duotone" : "regular"}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto p-4">
            <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3">
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="size-2 rounded-full bg-sidebar-primary" />
                Preview surface
              </div>
              <p className="mt-2 text-xs leading-5 text-sidebar-foreground/55">
                Static examples · no live data
              </p>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl">
            <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  href="/"
                  className="flex items-center gap-2 md:hidden"
                  aria-label="RecordShield home"
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <ShieldIcon aria-hidden="true" className="size-4" weight="duotone" />
                  </span>
                  <span className="truncate text-sm font-semibold">RecordShield</span>
                </Link>
                <div className="hidden items-center gap-2 text-sm sm:flex">
                  <span className="text-muted-foreground">RecordShield</span>
                  <span className="text-border">/</span>
                  <span className="font-medium">Design system</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Link
                  href="/"
                  className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
                >
                  Home
                  <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
                </Link>
                <ThemeToggle />
              </div>
            </div>
          </header>

          <div className="border-b border-border/60 bg-primary/4.5 px-4 py-2.5 sm:px-6 lg:px-10">
            <div className="mx-auto flex max-w-7xl items-center gap-2 text-xs text-muted-foreground">
              <PulseIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-primary"
                weight="duotone"
              />
              <span>
                <span className="font-semibold text-foreground">Component reference</span> ·
                representative states only
              </span>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

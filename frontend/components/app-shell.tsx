import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bell,
  CaretDown,
  ClipboardText,
  IdentificationCard,
  LockKey,
  MagnifyingGlass,
  Pulse,
  Shield,
  Siren,
  SlidersHorizontal,
  SquaresFour,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type AppContext = {
  hospital: string;
  environment: string;
  connection: "online" | "offline";
  user: {
    initials: string;
    name: string;
    role: string;
  };
  notifications?: {
    unread: number;
  };
};

type AppShellProps = {
  children: ReactNode;
  context?: AppContext;
  variant?: "workspace" | "design-system";
};

const workspaceNavigation = [
  { label: "Overview", href: "/#overview", icon: SquaresFour },
  { label: "Patients", href: "/#workspace", icon: IdentificationCard },
  { label: "Exchange", href: "/#scope", icon: ClipboardText },
  { label: "Emergency", href: "/#emergency", icon: Siren },
  { label: "Security", href: "/#security", icon: Shield },
];

const designSystemNavigation = [
  { label: "Overview", href: "/design-system#overview", icon: SquaresFour },
  { label: "Foundations", href: "/design-system#foundations", icon: SlidersHorizontal },
  { label: "Patterns", href: "/design-system#patterns", icon: IdentificationCard },
  { label: "States", href: "/design-system#states", icon: Pulse },
  { label: "Product workspace", href: "/", icon: Shield },
];

export function AppShell({ children, context, variant = "workspace" }: AppShellProps) {
  const isDesignSystem = variant === "design-system";
  const navigation = isDesignSystem ? designSystemNavigation : workspaceNavigation;
  const hospital = context?.hospital ?? "RecordShield";
  const environment = context?.environment ?? "Loading context";
  const connection = context?.connection ?? "offline";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
          <div className="flex h-20 items-center gap-3 px-6">
            <div className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <Shield aria-hidden="true" className="size-5" weight="duotone" />
            </div>
            <div>
              <p className="font-heading text-sm font-semibold tracking-tight">RecordShield</p>
              <p className="text-[0.65rem] uppercase tracking-[0.18em] text-sidebar-foreground/55">
                Clinical trust layer
              </p>
            </div>
          </div>

          <Separator className="bg-sidebar-border" />

          <nav aria-label="Primary navigation" className="flex-1 space-y-7 px-3 py-6">
            <div>
              <p className="px-3 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">
                {isDesignSystem ? "Design system" : "Workspace"}
              </p>
              <div className="space-y-1">
                {navigation.map((item, index) => {
                  const Icon = item.icon;
                  const active = index === 0;

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-[background-color,color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70",
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-4"
                        weight={active ? "duotone" : "regular"}
                      />
                      <span>{item.label}</span>
                      {!isDesignSystem && item.label === "Security" ? (
                        <span className="ml-auto size-2 rounded-full bg-emergency" />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>

            {!isDesignSystem ? (
              <div>
                <p className="px-3 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">
                  Configure
                </p>
                <Link
                  href="/design-system"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-[background-color,color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  <SlidersHorizontal aria-hidden="true" className="size-4" />
                  <span>Design system</span>
                </Link>
              </div>
            ) : null}
          </nav>

          <div className="p-4">
            <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-xs font-medium">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      connection === "online" ? "bg-sidebar-primary" : "bg-sidebar-foreground/40",
                    )}
                  />
                  <span className="truncate">{hospital}</span>
                </span>
                <Badge className="border-sidebar-border bg-transparent text-[0.6rem] text-sidebar-foreground/70">
                  {environment}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-sidebar-foreground/55">
                {isDesignSystem
                  ? "Preview surface · no live data"
                  : "Synthetic environment · data resets daily"}
              </p>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl">
            <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground md:hidden">
                  <Shield aria-hidden="true" className="size-4" weight="duotone" />
                </div>
                <div className="hidden min-w-0 items-center gap-2 sm:flex">
                  <span className="truncate text-sm font-medium text-foreground">{hospital}</span>
                  <CaretDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1.5",
                      connection === "online"
                        ? "border-success/25 bg-success/8 text-success"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        connection === "online" ? "bg-success" : "bg-muted-foreground",
                      )}
                    />
                    {connection === "online" ? "Online" : "Connecting"}
                  </Badge>
                </div>
                <div className="flex min-w-0 items-center gap-2 sm:hidden">
                  <span className="truncate text-sm font-semibold">RecordShield</span>
                  <Badge variant="outline" className="text-[0.6rem]">
                    {isDesignSystem ? "Preview" : "Workspace"}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  aria-label="Search workspace"
                  variant="ghost"
                  size="icon"
                  className="hidden sm:inline-flex"
                >
                  <MagnifyingGlass aria-hidden="true" />
                </Button>
                <Button aria-label="Notifications" variant="ghost" size="icon" className="relative">
                  <Bell aria-hidden="true" />
                  {context?.notifications?.unread ? (
                    <span
                      aria-label={`${context.notifications.unread} unread notifications`}
                      className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-emergency"
                    />
                  ) : null}
                </Button>
                <ThemeToggle />
                <Separator orientation="vertical" className="mx-2 hidden h-6 sm:block" />
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-primary/12 text-xs font-bold text-primary">
                    {context?.user.initials ?? "—"}
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block truncate text-xs font-semibold">
                      {context?.user.name ?? "Loading user"}
                    </span>
                    <span className="block truncate text-[0.65rem] text-muted-foreground">
                      {context?.user.role ?? "Awaiting context"}
                    </span>
                  </span>
                  <CaretDown
                    aria-hidden="true"
                    className="hidden size-3.5 text-muted-foreground sm:block"
                  />
                </button>
              </div>
            </div>
          </header>

          <div className="border-b border-border/60 bg-primary/[0.045] px-4 py-2.5 sm:px-6 lg:px-10">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <Pulse
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-primary"
                  weight="duotone"
                />
                <span className="truncate">
                  <span className="font-semibold text-foreground">
                    {isDesignSystem ? "Component preview" : "Synthetic environment"}
                  </span>
                  {isDesignSystem ? " · representative states only" : " · no real patient data"}
                </span>
              </p>
              <span className="hidden items-center gap-1.5 text-[0.68rem] text-muted-foreground sm:flex">
                <LockKey aria-hidden="true" className="size-3" weight="duotone" />
                Context enforced
              </span>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

export type { AppShellProps };

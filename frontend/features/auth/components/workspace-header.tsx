"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BuildingsIcon,
  ClockCountdownIcon,
  SignOutIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRemaining, formatRoleName } from "@/utils/formatters";
import { useLogout, useSession } from "@/hooks/auth";

export function WorkspaceHeader() {
  const router = useRouter();
  const session = useSession();
  const logout = useLogout();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (session.isPending) {
    return (
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-8 w-28" />
        </div>
      </header>
    );
  }

  const context = session.data;
  const shiftEndsAt = context?.shift ? new Date(context.shift.ends_at).getTime() : 0;
  const shiftActive = Boolean(context?.shift?.active && shiftEndsAt > now);

  const handleLogout = () => {
    logout.mutate(undefined, { onSettled: () => router.replace("/login") });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/workspace"
            className="flex items-center gap-2 md:hidden"
            aria-label="RecordShield home"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <BuildingsIcon aria-hidden="true" className="size-4" weight="duotone" />
            </span>
            <span className="truncate text-sm font-semibold">RecordShield</span>
          </Link>
          <div className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
            <span className="truncate text-muted-foreground">RecordShield</span>
            <span className="text-border">/</span>
            <span className="font-medium">{context?.organization?.name ?? "Home"}</span>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          {context?.organization ? (
            <div className="hidden items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-1.5 text-xs sm:flex">
              <BuildingsIcon
                aria-hidden="true"
                className="size-3.5 text-primary"
                weight="duotone"
              />
              <span className="max-w-32 truncate font-medium">{context.organization.name}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-widest text-muted-foreground">
                {context.organization.mode === "LITE" ? "Lite" : "EMR"}
              </span>
            </div>
          ) : null}

          <div className="hidden items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-1.5 text-xs lg:flex">
            <ClockCountdownIcon
              aria-hidden="true"
              className="size-3.5 text-primary"
              weight="duotone"
            />
            <span className={shiftActive ? "text-foreground" : "text-destructive"}>
              {context?.shift ? formatRemaining(shiftEndsAt - now) : "No active shift"}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-2.5 py-1.5">
            <UserCircleIcon aria-hidden="true" className="size-4 text-primary" weight="duotone" />
            <span className="hidden max-w-28 truncate text-xs font-medium sm:block">
              {context?.user.username ?? "Account unavailable"}
            </span>
            <span className="hidden text-[0.65rem] text-muted-foreground xl:block">
              {formatRoleName(context?.role ?? null)}
            </span>
          </div>

          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            <SignOutIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
    </header>
  );
}

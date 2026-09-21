"use client";

import {
  BellIcon,
  ClockIcon,
  EyeIcon,
  LinkSimpleIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import type { PortalResponse } from "@/lib/api/contracts/exchange";
import { formatDomain, formatUtcDate } from "@/utils/formatters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationsCard } from "./notifications-card";
import { ApprovalCard } from "./approval-card";
import { GrantCard } from "./grant-card";
import { PortalState } from "./portal-state";

type PortalPageViewProps = {
  data: PortalResponse;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onLogout: () => void;
  isLoggingOut: boolean;
};

export function PortalPageView({
  data,
  onLogout,
  isLoggingOut,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: PortalPageViewProps) {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-background px-4 py-7 sm:px-6 lg:px-10 lg:py-10"
    >
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShieldCheckIcon aria-hidden="true" className="size-5" weight="duotone" />
            </span>
            <div>
              <p className="font-heading text-sm font-semibold tracking-tight">RecordShield</p>
              <p className="text-xs text-muted-foreground">Patient access portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/65 px-3 py-2">
            <UserCircleIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
            <div>
              <p className="text-sm font-medium">{data.patient.name}</p>
              <p className="text-xs text-muted-foreground">{data.patient.health_id}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout} disabled={isLoggingOut}>
            Sign out
          </Button>
        </header>

        <section className="py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Your connected care
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Review who can access your records.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose which records to share, who can see them, and how long access lasts.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="px-5 py-5 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BellIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
                  Pending requests
                </CardTitle>
                <CardDescription>
                  Approve only the records you want to share. Emergency access is handled separately
                  and appears in your access history.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-5 pb-6 sm:px-6">
                {data.requests.items
                  .filter((request) => request.status === "PENDING")
                  .map((request) => (
                    <ApprovalCard key={request.id} request={request} />
                  ))}
                {!data.requests.items.some((request) => request.status === "PENDING") ? (
                  <PortalState
                    compact
                    title="No pending requests"
                    description="New requests will appear here when a practitioner asks for access."
                  />
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-5 py-5 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <EyeIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
                  Active access
                </CardTitle>
                <CardDescription>
                  Stop future access at any time. Records already viewed remain in your access
                  history.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5 sm:px-6">
                {data.grants.items
                  .filter((grant) => grant.status === "ACTIVE")
                  .map((grant) => (
                    <GrantCard key={grant.id} grant={grant} />
                  ))}
                {!data.grants.items.some((grant) => grant.status === "ACTIVE") ? (
                  <PortalState
                    compact
                    title="No active sharing permissions"
                    description="Approved access will appear here with its expiry time."
                  />
                ) : null}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card>
              <CardHeader className="px-5 py-5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <LinkSimpleIcon aria-hidden="true" className="size-4 text-primary" />
                  Connected facilities
                </CardTitle>
                <CardDescription>
                  Verified facilities linked to your RecordShield identity.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5">
                {data.facilities.items.map((facility) => (
                  <div
                    key={facility.organization_id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/60 px-3 py-2.5"
                  >
                    <span className="text-sm font-medium">{facility.name}</span>
                    <span className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                      Connected
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="px-5 py-5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClockIcon aria-hidden="true" className="size-4 text-primary" />
                  Access history
                </CardTitle>
                <CardDescription>See who viewed your records and when.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5">
                {data.access.items.map((event) => (
                  <div
                    key={event.event_id}
                    className="border-b border-border/65 pb-3 last:border-0 last:pb-0"
                  >
                    <p className="text-sm font-medium">{event.practitioner_name}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {event.source.name} · {event.domains.map(formatDomain).join(" · ")} ·{" "}
                      {formatUtcDate(event.occurred_at)}
                    </p>
                  </div>
                ))}
                {!data.access.items.length ? (
                  <p className="text-sm text-muted-foreground">No access events yet.</p>
                ) : null}
              </CardContent>
            </Card>
            <NotificationsCard notifications={data.notifications.items} />
          </aside>
        </section>
        {hasMore ? (
          <Button className="mt-6" variant="outline" onClick={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? "Loading…" : "Load more updates"}
          </Button>
        ) : null}
      </div>
    </main>
  );
}

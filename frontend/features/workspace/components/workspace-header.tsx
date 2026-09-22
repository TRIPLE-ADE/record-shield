"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { formatRole } from "../utils/format";
import type { WorkspaceOverviewProps } from "../types";

type WorkspaceHeaderProps = Pick<WorkspaceOverviewProps, "context" | "isFetching" | "onRefresh"> & {
  isSecurity: boolean;
};

export function WorkspaceHeader({
  context,
  isFetching,
  onRefresh,
  isSecurity,
}: WorkspaceHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground">
          {context.organization?.name ?? "RecordShield"} <span aria-hidden="true">/</span>{" "}
          {formatRole(context.role)}
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">Home</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isSecurity
            ? "Review access activity and keep your organisation running safely."
            : "Pick up patient care and keep record requests moving."}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={isFetching}>
        <ArrowClockwiseIcon aria-hidden="true" className={isFetching ? "animate-spin" : ""} />
        Refresh
      </Button>
    </header>
  );
}

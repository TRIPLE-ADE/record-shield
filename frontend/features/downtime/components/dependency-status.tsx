"use client";

import { CheckCircleIcon, CloudSlashIcon, WifiHighIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DemoDependency, DemoStatus } from "@/lib/api/contracts/demo";
import { dependencyLabels } from "../utils/format";

export function DependencyStatus({ demoStatus }: { demoStatus?: DemoStatus }) {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const entries: Array<[DemoDependency, { available: boolean; label: string }]> = demoStatus
    ? (Object.entries(demoStatus.dependencies) as Array<
        [DemoDependency, { available: boolean; label: string }]
      >)
    : (["SOURCE", "CONSENT", "AUDIT"] as const).map(
        (dependency) =>
          [
            dependency,
            { available: online, label: online ? "Available" : "Browser offline" },
          ] as const,
      );

  return (
    <Card>
      <CardHeader className="border-b border-border/70 px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {online ? (
                <WifiHighIcon aria-hidden="true" className="size-4 text-success" weight="duotone" />
              ) : (
                <CloudSlashIcon
                  aria-hidden="true"
                  className="size-4 text-warning"
                  weight="duotone"
                />
              )}
              Dependency readiness
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Protected reads fail closed when a required dependency is unavailable.
            </p>
          </div>
          <Badge variant={online ? "outline" : "destructive"}>
            {online ? "Online" : "Offline"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 py-5 sm:grid-cols-3 sm:px-6">
        {entries.map(([dependency, status]) => (
          <div key={dependency} className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{dependencyLabels[dependency]}</p>
              {status.available ? (
                <CheckCircleIcon
                  aria-hidden="true"
                  className="size-4 text-success"
                  weight="duotone"
                />
              ) : (
                <CloudSlashIcon
                  aria-hidden="true"
                  className="size-4 text-warning"
                  weight="duotone"
                />
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{status.label}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

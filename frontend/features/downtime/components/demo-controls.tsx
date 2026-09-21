"use client";

import { ArrowClockwiseIcon, FloppyDiskIcon, WarningOctagonIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DemoDependency, DemoStatus } from "@/lib/api/contracts/demo";
import { useDemoControls } from "@/hooks/downtime";
import { dependencyLabels } from "../utils/format";

const faultOrder: DemoDependency[] = [
  "SOURCE",
  "CONSENT",
  "AUDIT",
  "MALFORMED_SOURCE",
  "UNRESOLVED_TRANSACTION",
];

export function DemoControls({ status }: { status: DemoStatus }) {
  const controls = useDemoControls();
  return (
    <Card className="border-primary/20 bg-primary/3">
      <CardHeader className="px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <WarningOctagonIcon
                aria-hidden="true"
                className="size-4 text-primary"
                weight="duotone"
              />
              Demo rehearsal controls
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              These controls only exist in local demo mode.
            </p>
          </div>
          <Badge variant="outline">Run {status.run_id.slice(0, 8)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5 sm:px-6">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => controls.reset.mutate()}
            disabled={controls.reset.isPending}
          >
            <ArrowClockwiseIcon
              aria-hidden="true"
              className={controls.reset.isPending ? "animate-spin" : ""}
            />
            Fresh demo seed
          </Button>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <FloppyDiskIcon aria-hidden="true" className="size-3.5" />
            Reset creates a new run ID.
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {faultOrder.map((dependency) => {
            const enabled = !status.dependencies[dependency].available;
            return (
              <Button
                key={dependency}
                type="button"
                variant={enabled ? "destructive" : "outline"}
                size="sm"
                className="justify-between"
                onClick={() => controls.setFault.mutate({ dependency, enabled: !enabled })}
                disabled={controls.setFault.isPending}
              >
                <span>{dependencyLabels[dependency]}</span>
                <span className="text-[0.65rem] uppercase tracking-[0.1em]">
                  {enabled ? "On" : "Off"}
                </span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

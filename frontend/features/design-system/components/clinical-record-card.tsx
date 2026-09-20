import type { ReactNode } from "react";
import { FileTextIcon } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SensitivityBadge, type Sensitivity } from "./sensitivity-badge";
import { SourceProvenance } from "./source-provenance";

type ClinicalRecordCardProps = {
  domain: string;
  title: string;
  summary: string;
  sensitivity: Sensitivity;
  source: string;
  recordId: string;
  version: string;
  observedAt: string;
  retrievedAt: string;
  children?: ReactNode;
};

export function ClinicalRecordCard({
  domain,
  title,
  summary,
  sensitivity,
  source,
  recordId,
  version,
  observedAt,
  retrievedAt,
  children,
}: ClinicalRecordCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="gap-3 border-b border-border/70">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
              <FileTextIcon aria-hidden="true" className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {domain}
              </p>
              <CardTitle className="truncate text-base">{title}</CardTitle>
            </div>
          </div>
          <SensitivityBadge level={sensitivity} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <p className="text-sm leading-6 text-muted-foreground">{summary}</p>
        {children}
        <SourceProvenance
          source={source}
          recordId={recordId}
          version={version}
          observedAt={observedAt}
          retrievedAt={retrievedAt}
        />
      </CardContent>
    </Card>
  );
}

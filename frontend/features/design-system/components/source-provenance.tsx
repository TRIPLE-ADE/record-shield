import { ArrowUpRight, Clock, Database, Fingerprint } from "@phosphor-icons/react";

type SourceProvenanceProps = {
  source: string;
  recordId: string;
  version: string;
  observedAt: string;
  retrievedAt: string;
};

export function SourceProvenance({
  source,
  recordId,
  version,
  observedAt,
  retrievedAt,
}: SourceProvenanceProps) {
  return (
    <dl className="grid gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground sm:grid-cols-2">
      <div className="flex min-w-0 items-center gap-2">
        <Database aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        <dt className="sr-only">Source</dt>
        <dd className="truncate" title={`${source} · ${recordId}`}>
          <span className="font-medium text-foreground">{source}</span> · {recordId}
        </dd>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Fingerprint aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        <dt className="sr-only">Version</dt>
        <dd className="truncate">{version}</dd>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Clock aria-hidden="true" className="size-3.5 shrink-0" />
        <dt className="sr-only">Observed</dt>
        <dd>Observed {observedAt}</dd>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
        <dt className="sr-only">Retrieved</dt>
        <dd>Retrieved {retrievedAt}</dd>
      </div>
    </dl>
  );
}

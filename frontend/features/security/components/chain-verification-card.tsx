import { useState } from "react";
import { ArrowClockwiseIcon, CheckCircleIcon, FingerprintIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useVerifySecurityChain } from "@/hooks/security";
import type { ChainVerification } from "@/lib/api/contracts/security";
import { formatSecurityTime } from "../utils/format";

export function ChainVerificationCard({
  streamId,
  onResult,
  onUnknown,
}: {
  streamId: string;
  onResult: (result: ChainVerification) => void;
  onUnknown: () => void;
}) {
  const [result, setResult] = useState<ChainVerification>();
  const [unknown, setUnknown] = useState(false);
  const mutation = useVerifySecurityChain();
  const verify = () =>
    mutation.mutate(
      { streamId },
      {
        onSuccess: (value) => {
          setResult(value);
          setUnknown(false);
          onResult(value);
          toast.success("Audit chain verified");
        },
        onError: (error) => {
          setUnknown(true);
          onUnknown();
          toast.error(error instanceof Error ? error.message : "Chain verification failed.");
        },
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FingerprintIcon aria-hidden="true" className="size-4 text-primary" weight="duotone" />
          Chain integrity
        </CardTitle>
        <CardDescription>
          Run a read-only verification against the current stream snapshot.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CheckCircleIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
            <div>
              <p className="text-sm font-medium">
                {result
                  ? `Checked sequences ${result.checked_from}–${result.checked_to}`
                  : unknown
                    ? "Verification state is unknown"
                    : "No verification run yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {result
                  ? formatSecurityTime(result.verified_at)
                  : unknown
                    ? "The service did not return a verification result."
                    : "Verification produces a checkpoint for review."}
              </p>
            </div>
            {result ? (
              <Badge variant={result.status === "VALID" ? "secondary" : "destructive"}>
                {result.status}
              </Badge>
            ) : unknown ? (
              <Badge variant="outline">UNKNOWN</Badge>
            ) : null}
          </div>
          <Button variant="outline" onClick={verify} disabled={mutation.isPending}>
            <ArrowClockwiseIcon
              aria-hidden="true"
              className={mutation.isPending ? "animate-spin" : undefined}
            />
            {mutation.isPending ? "Checking…" : "Verify chain"}
          </Button>
        </div>
        {result ? (
          <dl className="grid gap-x-5 gap-y-2 border-t border-border/70 pt-3 text-xs text-muted-foreground sm:grid-cols-4">
            <div>
              <dt>First failing sequence</dt>
              <dd className="mt-1 font-medium text-foreground">
                {result.first_failing_sequence ?? "None"}
              </dd>
            </div>
            <div>
              <dt>Failure reason</dt>
              <dd className="mt-1 font-medium text-foreground">
                {result.reason?.replaceAll("_", " ") ?? "None"}
              </dd>
            </div>
            <div>
              <dt>Checkpoint</dt>
              <dd className="mt-1 font-medium text-foreground">
                {result.checkpoint_comparison.replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt>Head sequence</dt>
              <dd className="mt-1 font-medium text-foreground">{result.checkpoint.sequence}</dd>
            </div>
          </dl>
        ) : null}
        {result?.status === "INVALID" ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Critical chain integrity failure remains open for review.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

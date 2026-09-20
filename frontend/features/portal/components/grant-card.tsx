"use client";

import { LockKeyIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { ExchangeDomain } from "@/lib/api/contracts/exchange";
import { Button } from "@/components/ui/button";
import { useRevokeGrant } from "@/hooks/exchange";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatDomain, formatUtcDate } from "@/utils/formatters";

export function GrantCard({
  grant,
}: {
  grant: {
    id: string;
    source: { name: string };
    practitioner_name: string;
    domains: ExchangeDomain[];
    expires_at: string;
    version: number;
  };
}) {
  const revoke = useRevokeGrant();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/20 bg-success/5 p-4">
      <div>
        <p className="text-sm font-medium">
          {grant.practitioner_name} · {grant.source.name}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {grant.domains.map(formatDomain).join(" · ")} · expires {formatUtcDate(grant.expires_at)}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={revoke.isPending}
        onClick={() =>
          revoke.mutate(
            { grantId: grant.id, input: { expected_version: grant.version } },
            {
              onSuccess: () => toast.success("Access revoked"),
              onError: (error) => toast.error(getApiErrorMessage(error)),
            },
          )
        }
      >
        <LockKeyIcon aria-hidden="true" />
        Revoke
      </Button>
    </div>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import {
  approveConsentSchema,
  type ApproveConsent,
  type ConsentRequest,
} from "@/lib/api/contracts/exchange";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApproveConsent, useDenyConsent } from "@/hooks/exchange";
import { formatDomain } from "@/utils/formatters";
import { getApiErrorMessage } from "@/lib/api/errors";

export function ApprovalCard({ request }: { request: ConsentRequest }) {
  const approve = useApproveConsent();
  const deny = useDenyConsent();
  const form = useForm<ApproveConsent>({
    resolver: zodResolver(approveConsentSchema),
    defaultValues: { selected_domains: [], duration: "PT24H", expected_version: request.version },
  });
  const selectedDomains = useWatch({ control: form.control, name: "selected_domains" }) ?? [];
  const duration = useWatch({ control: form.control, name: "duration" }) ?? "PT24H";
  const selectedDomainSet = new Set(selectedDomains);

  const submit = form.handleSubmit((values) => {
    approve.mutate(
      { requestId: request.id, input: values },
      {
        onSuccess: () => toast.success("Access approved"),
        onError: (error) => toast.error(getApiErrorMessage(error)),
      },
    );
  });

  return (
    <form className="rounded-xl border border-primary/20 bg-primary/3 p-4 sm:p-5" onSubmit={submit}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{request.practitioner_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {request.recipient.name} requests records from {request.source.name}
          </p>
        </div>
        <span className="rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-[0.68rem] font-semibold text-warning-foreground">
          Pending
        </span>
      </div>
      <div className="mt-4 rounded-lg bg-background/70 p-3 text-sm leading-6">
        <span className="font-medium">Reason: </span>
        {request.reason}
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Choose records to share
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {request.requested_domains.map((domain) => {
            const checked = selectedDomainSet.has(domain);
            return (
              <label
                key={domain}
                htmlFor={`approve-${request.id}-${domain}`}
                aria-label={formatDomain(domain)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${checked ? "border-primary/40 bg-primary/8" : "border-border/70"}`}
              >
                <input
                  id={`approve-${request.id}-${domain}`}
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={checked}
                  onChange={() =>
                    form.setValue(
                      "selected_domains",
                      checked
                        ? selectedDomains.filter((value) => value !== domain)
                        : [...selectedDomains, domain],
                      { shouldDirty: true, shouldValidate: true },
                    )
                  }
                />
                <span>{formatDomain(domain)}</span>
              </label>
            );
          })}
        </div>
        {form.formState.errors.selected_domains ? (
          <p className="mt-1 text-xs text-destructive">Choose at least one record category.</p>
        ) : null}
      </div>
      <div className="mt-4 space-y-1.5">
        <Label htmlFor={`duration-${request.id}`}>Duration</Label>
        <Select
          value={duration}
          onValueChange={(value) =>
            form.setValue("duration", value as ApproveConsent["duration"], { shouldDirty: true })
          }
        >
          <SelectTrigger id={`duration-${request.id}`} className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PT1H">1 hour</SelectItem>
            <SelectItem value="PT24H">24 hours</SelectItem>
            <SelectItem value="P7D">7 days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={deny.isPending || approve.isPending}
          onClick={() =>
            deny.mutate(
              { requestId: request.id, input: { expected_version: request.version } },
              {
                onSuccess: () => toast.success("Request denied"),
                onError: (error) => toast.error(getApiErrorMessage(error)),
              },
            )
          }
        >
          <XCircleIcon aria-hidden="true" />
          Deny
        </Button>
        <Button type="submit" disabled={approve.isPending || deny.isPending}>
          {approve.isPending ? "Saving…" : "Approve selected access"}
          <CheckCircleIcon aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}

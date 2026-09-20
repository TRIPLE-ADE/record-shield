"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  DatabaseIcon,
  FileArrowUpIcon,
} from "@phosphor-icons/react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api/errors";
import { FormFieldError } from "@/components/form-field-error";
import {
  consentRequestCreateSchema,
  type ConsentRequestCreate,
} from "@/lib/api/contracts/exchange";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCreateConsentRequest, useDiscoverSources } from "@/hooks/exchange";
import { ExchangeError } from "./exchange-error";
import { ExchangeState } from "./exchange-state";
import { requestDomains } from "../data/request-domains";

export function SourceRequestPanel({
  patientId,
  receivingEncounterId,
}: {
  patientId: string;
  receivingEncounterId: string;
}) {
  const [sourceId, setSourceId] = useState("");
  const sources = useDiscoverSources(patientId, receivingEncounterId);
  const requestMutation = useCreateConsentRequest();
  const form = useForm<ConsentRequestCreate>({
    resolver: zodResolver(consentRequestCreateSchema),
    defaultValues: {
      patient_id: patientId,
      source_org_id: "",
      receiving_encounter_id: receivingEncounterId,
      purpose: "treatment",
      requested_domains: [],
      reason: "",
    },
  });
  const selectedDomains = useWatch({ control: form.control, name: "requested_domains" }) ?? [];
  const selectedDomainSet = new Set(selectedDomains);
  const submitRequest = form.handleSubmit((values) => {
    requestMutation.mutate(
      {
        ...values,
        patient_id: patientId,
        source_org_id: sourceId,
        receiving_encounter_id: receivingEncounterId,
      },
      {
        onSuccess: () => {
          form.reset({
            patient_id: patientId,
            source_org_id: sourceId,
            receiving_encounter_id: receivingEncounterId,
            purpose: "treatment",
            requested_domains: [],
            reason: "",
          });
          toast.success("Consent request sent");
        },
        onError: (error) => toast.error(getApiErrorMessage(error)),
      },
    );
  });

  return (
    <>
      <Card>
        <CardHeader className="px-5 py-5 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-lg">
            <DatabaseIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
            Verified sources
          </CardTitle>
          <CardDescription>
            Only linked facilities with an active receiving encounter appear here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5 sm:px-6">
          {sources.isPending ? <Skeleton className="h-20 rounded-xl" /> : null}
          {sources.error ? <ExchangeError error={sources.error} /> : null}
          {sources.data?.items.map((source) => {
            const selected = source.organization.organization_id === sourceId;
            return (
              <button
                key={source.organization.organization_id}
                type="button"
                aria-label={`Select ${source.organization.name}`}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${selected ? "border-primary bg-primary/7" : "border-border/70 bg-card hover:border-primary/35"}`}
                onClick={() => {
                  setSourceId(source.organization.organization_id);
                  form.setValue("source_org_id", source.organization.organization_id, {
                    shouldValidate: true,
                  });
                  form.setValue("receiving_encounter_id", receivingEncounterId, {
                    shouldValidate: true,
                  });
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block font-medium">{source.organization.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Existing EMR · linked facility
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                    <CheckCircleIcon aria-hidden="true" className="size-4" weight="duotone" />
                    Available
                  </span>
                </div>
              </button>
            );
          })}
          {!sources.isPending && !sources.error && !sources.data?.items.length ? (
            <ExchangeState
              kind="empty"
              title="No linked source is available"
              description="The current encounter has no eligible remote facility."
              compact
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-5 py-5 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileArrowUpIcon aria-hidden="true" className="size-5 text-primary" weight="duotone" />
            Define the request
          </CardTitle>
          <CardDescription>
            The patient sees this reason, practitioner, source, and exact domain set.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-6 sm:px-6">
          <form className="space-y-5" onSubmit={submitRequest}>
            <div>
              <p className="text-sm font-medium">Domains requested</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {requestDomains.map((domain) => {
                  const checked = selectedDomainSet.has(domain.value);
                  return (
                    <label
                      key={domain.value}
                      htmlFor={`${domain.value}-domain`}
                      aria-label={domain.label}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${checked ? "border-primary/40 bg-primary/6" : "border-border/70 hover:bg-muted/50"}`}
                    >
                      <input
                        id={`${domain.value}-domain`}
                        type="checkbox"
                        className="mt-0.5 size-4 accent-primary"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? selectedDomains.filter((value) => value !== domain.value)
                            : [...selectedDomains, domain.value];
                          form.setValue("requested_domains", next, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }}
                      />
                      <span>
                        <span className="block text-sm font-medium">{domain.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {domain.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {form.formState.errors.requested_domains ? (
                <FormFieldError message={form.formState.errors.requested_domains.message} />
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="consent-reason">Patient-visible reason</Label>
              <Textarea
                id="consent-reason"
                placeholder="Explain why these source records are relevant to current treatment…"
                {...form.register("reason")}
                aria-invalid={Boolean(form.formState.errors.reason)}
              />
              {form.formState.errors.reason ? (
                <FormFieldError message={form.formState.errors.reason.message} />
              ) : null}
            </div>
            {!sourceId ? (
              <p className="text-xs text-muted-foreground">Choose a verified source to continue.</p>
            ) : null}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!sourceId || !receivingEncounterId || requestMutation.isPending}
              >
                {requestMutation.isPending ? "Sending…" : "Send consent request"}
                <ArrowRightIcon aria-hidden="true" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

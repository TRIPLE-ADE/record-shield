"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockKeyIcon } from "@phosphor-icons/react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  emergencyExpansionSchema,
  type EmergencyDomain,
  type EmergencySession,
} from "@/lib/api/contracts/emergency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useExpandEmergency } from "@/hooks/emergency";
import { emergencyDomainOptions } from "../data/options";
import { getEmergencyErrorMessage } from "../utils/format";

export function ExpansionCard({
  session,
  open,
  onOpenChange,
  expandedDomains,
  onExpanded,
}: {
  session: EmergencySession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expandedDomains: EmergencyDomain[];
  isSubmitting: boolean;
  onExpanded: (domains: EmergencyDomain[]) => void;
}) {
  const [selectedDomains, setSelectedDomains] = useState<EmergencyDomain[]>([]);
  const expand = useExpandEmergency();
  const form = useForm<z.infer<typeof emergencyExpansionSchema>>({
    resolver: zodResolver(emergencyExpansionSchema),
    defaultValues: { domains: [], narrative: "", expected_version: session.version },
    mode: "onChange",
  });
  const narrative = useWatch({ control: form.control, name: "narrative" }) ?? "";
  const selectedDomainSet = new Set(selectedDomains);
  const expandedDomainSet = new Set(expandedDomains);

  function toggleDomain(domain: EmergencyDomain) {
    const next = selectedDomains.includes(domain)
      ? selectedDomains.filter((item) => item !== domain)
      : [...selectedDomains, domain];
    setSelectedDomains(next);
    form.setValue("domains", next, { shouldValidate: true });
  }

  function submit(values: z.infer<typeof emergencyExpansionSchema>) {
    expand.mutate(
      {
        sessionId: session.id,
        input: { ...values, domains: selectedDomains, expected_version: session.version },
      },
      {
        onSuccess: (result) => {
          if (result.view === "expanded") {
            const next = result.session.expanded_domains;
            onExpanded(next);
            form.reset({ domains: [], narrative: "", expected_version: result.session.version });
            setSelectedDomains([]);
            toast.success("Level 2 scope granted");
          }
        },
        onError: (error) => toast.error(getEmergencyErrorMessage(error)),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="px-5 py-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <LockKeyIcon aria-hidden="true" className="size-4 text-emergency" />
          Request a specific domain
        </CardTitle>
        <CardDescription>
          Level 2 requires an explicit domain and a treatment narrative. Restricted source domains
          remain unavailable.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <Button
          type="button"
          className="w-full"
          variant="outline"
          onClick={() => onOpenChange(true)}
          disabled={session.justification_status === "JUSTIFICATION_OVERDUE"}
        >
          Choose Level 2 domains
        </Button>
      </CardContent>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose the smallest useful scope</DialogTitle>
            <DialogDescription>
              This request is added to the active emergency session and is visible in the audit
              trail.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={form.handleSubmit(submit)}>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold">Available domains</legend>
              {emergencyDomainOptions.map((option) => {
                const checked = selectedDomainSet.has(option.value);
                const alreadyExpanded = expandedDomainSet.has(option.value);
                const disabled = option.restricted || alreadyExpanded;
                return (
                  <div
                    key={option.value}
                    className={`flex items-start gap-3 rounded-xl border p-3 ${
                      disabled
                        ? "cursor-not-allowed border-border/50 opacity-55"
                        : "cursor-pointer border-border/80 hover:border-primary/40"
                    } ${checked ? "border-primary/50 bg-primary/5" : ""}`}
                  >
                    <input
                      id={`emergency-domain-${option.value}`}
                      aria-label={option.label}
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleDomain(option.value)}
                      className="mt-1 size-4 accent-primary"
                    />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {option.label}
                        {option.restricted ? (
                          <LockKeyIcon aria-hidden="true" className="size-3.5 text-emergency" />
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {alreadyExpanded ? "Already in this session" : option.description}
                      </span>
                    </span>
                  </div>
                );
              })}
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="expansion-narrative">
                Why is this needed for immediate treatment?
              </Label>
              <Textarea
                id="expansion-narrative"
                {...form.register("narrative")}
                rows={4}
                minLength={20}
                maxLength={1000}
                placeholder="Describe the immediate treatment decision this domain supports…"
              />
              <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                <span>20–1000 characters</span>
                <span className="tabular-nums">{narrative.length}/1000</span>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Keep current scope
              </Button>
              <Button type="submit" disabled={!form.formState.isValid || expand.isPending}>
                {expand.isPending ? "Requesting…" : "Request Level 2 access"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

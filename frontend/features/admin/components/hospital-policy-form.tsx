"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateHospitalPolicy } from "@/hooks/admin";
import {
  hospitalPolicyUpdateSchema,
  type HospitalPolicy,
  type HospitalPolicyUpdate,
} from "@/lib/api/contracts/admin";
import { adminRoleOptions, emergencyDomainOptions } from "../data/options";

export function HospitalPolicyForm({ policy }: { policy: HospitalPolicy }) {
  const mutation = useUpdateHospitalPolicy();
  const form = useForm<HospitalPolicyUpdate>({
    resolver: zodResolver(hospitalPolicyUpdateSchema),
    defaultValues: {
      expected_version: policy.version,
      break_glass_enabled: policy.break_glass_enabled,
      eligible_roles: policy.eligible_roles,
      eligible_memberships: policy.eligible_memberships,
      source_normal_domains: policy.source_normal_domains,
      source_normal_max_sensitivity: policy.source_normal_max_sensitivity,
      source_emergency_roles: policy.source_emergency_roles,
      emergency_restricted_enabled: policy.emergency_restricted_enabled,
      source_emergency_level2_domains: policy.source_emergency_level2_domains,
    },
  });
  const sensitivity = useWatch({ control: form.control, name: "source_normal_max_sensitivity" });
  const submit = form.handleSubmit((input) =>
    mutation.mutate(input, {
      onSuccess: () => toast.success("Emergency policy updated"),
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Policy could not be updated."),
    }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Emergency policy</CardTitle>
        <CardDescription>
          Set the records and roles your hospital permits. Access also depends on the patient’s care
          assignment and current visit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border border-border/70 p-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                {...form.register("break_glass_enabled")}
              />
              <span>
                <span className="block font-medium">Emergency access enabled</span>
                <span className="text-xs text-muted-foreground">
                  Allow eligible clinicians to request a bounded summary.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border/70 p-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                {...form.register("emergency_restricted_enabled")}
              />
              <span>
                <span className="block font-medium">Restricted Level 2 enabled</span>
                <span className="text-xs text-muted-foreground">
                  Require explicit approval for each restricted record category.
                </span>
              </span>
            </label>
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Eligible roles</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {adminRoleOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <input
                    type="checkbox"
                    value={option.value}
                    className="size-4 accent-primary"
                    {...form.register("eligible_roles")}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="normal-sensitivity">Normal exchange ceiling</Label>
              <Select
                value={sensitivity}
                onValueChange={(value) =>
                  form.setValue(
                    "source_normal_max_sensitivity",
                    value as HospitalPolicyUpdate["source_normal_max_sensitivity"],
                    { shouldDirty: true },
                  )
                }
              >
                <SelectTrigger id="normal-sensitivity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STANDARD">Standard</SelectItem>
                  <SelectItem value="SENSITIVE">Sensitive</SelectItem>
                  <SelectItem value="RESTRICTED">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Additional record categories</Label>
              <div className="grid max-h-44 gap-2 overflow-y-auto rounded-lg border border-border/70 p-3 sm:grid-cols-2">
                {emergencyDomainOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <input
                      type="checkbox"
                      value={option.value}
                      className="size-3.5 accent-primary"
                      {...form.register("source_emergency_level2_domains")}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save policy"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

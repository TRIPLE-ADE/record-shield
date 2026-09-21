"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { FormFieldError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSuspendAdminTarget } from "@/hooks/admin";
import { suspensionFormSchema, type SuspensionFormValues } from "../schemas";

export function SuspensionPanel({
  organizationId,
  membershipIds,
  mode = "local",
}: {
  organizationId?: string;
  membershipIds?: string[];
  mode?: "local" | "trust";
}) {
  const localOrganizationId = organizationId ?? "";
  const localMembershipIds = membershipIds ?? [];
  const mutation = useSuspendAdminTarget();
  const form = useForm<SuspensionFormValues>({
    resolver: zodResolver(suspensionFormSchema),
    defaultValues: {
      target_type: "MEMBERSHIP",
      target_id: localMembershipIds[0] ?? localOrganizationId,
      reason: "",
    },
  });
  const targetType = useWatch({ control: form.control, name: "target_type" });
  const targetOptions = targetType === "ORGANIZATION" ? [localOrganizationId] : localMembershipIds;
  const submit = form.handleSubmit((values) =>
    mutation.mutate(
      { ...values, expected_version: 1 },
      {
        onSuccess: () => {
          toast.success("Suspension applied");
          form.reset({ ...values, reason: "" });
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Suspension could not be applied."),
      },
    ),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Safety suspension</CardTitle>
        <CardDescription>
          {mode === "trust"
            ? "Suspend an organization or membership under the trust boundary. Suspension takes effect on the next protected request."
            : "Suspend a local membership or the current organization. Suspension takes effect on the next protected request."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="suspension-type">Target type</Label>
              <select
                id="suspension-type"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                {...form.register("target_type", {
                  onChange: (event) => {
                    const value = event.target.value as SuspensionFormValues["target_type"];
                    form.setValue(
                      "target_id",
                      value === "ORGANIZATION"
                        ? localOrganizationId
                        : (localMembershipIds[0] ?? localOrganizationId),
                    );
                  },
                })}
              >
                <option value="MEMBERSHIP">Membership</option>
                <option value="ORGANIZATION">Organization</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="suspension-target">Target reference</Label>
              {mode === "trust" ? (
                <Input
                  id="suspension-target"
                  placeholder="Canonical organization or membership ID"
                  {...form.register("target_id")}
                />
              ) : (
                <select
                  id="suspension-target"
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  {...form.register("target_id")}
                >
                  {targetOptions.map((value) => (
                    <option key={value} value={value}>
                      {value.slice(0, 8)}…{value.slice(-4)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="suspension-reason">Reason</Label>
            <Textarea
              id="suspension-reason"
              placeholder="Explain the safety decision…"
              {...form.register("reason")}
              aria-invalid={Boolean(form.formState.errors.reason)}
            />
            {form.formState.errors.reason ? (
              <FormFieldError message={form.formState.errors.reason.message} />
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="destructive" disabled={mutation.isPending}>
              {mutation.isPending ? "Applying…" : "Apply suspension"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

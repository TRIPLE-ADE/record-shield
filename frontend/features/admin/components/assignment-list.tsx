"use client";

import { ClockIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUpsertContextAssignment } from "@/hooks/admin";
import type { AssignmentUpsert, ContextAssignment } from "@/lib/api/contracts/admin";
import { formatSecurityTime, formatIdentifier } from "@/features/security/utils/format";

function assignmentLabel(assignment: ContextAssignment) {
  return assignment.kind === "CARE"
    ? "Care relationship"
    : assignment.kind === "SHIFT"
      ? "Shift"
      : assignment.kind === "WARD"
        ? "Ward access"
        : "Task access";
}

function nextShiftEnd() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
}

export function AssignmentList({ assignments }: { assignments: ContextAssignment[] }) {
  const mutation = useUpsertContextAssignment();
  const extend = (assignment: ContextAssignment) => {
    const data = {
      ...assignment.data,
      ends_at: nextShiftEnd(),
    };
    mutation.mutate(
      {
        kind: assignment.kind,
        assignment_id: assignment.id,
        expected_version: assignment.version,
        data,
      } as AssignmentUpsert,
      {
        onSuccess: () => toast.success("Duty context updated"),
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Assignment could not be updated."),
      },
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClockIcon aria-hidden="true" className="size-4 text-primary" weight="duotone" /> Duty
          context
        </CardTitle>
        <CardDescription>
          Review the editable assignments that shape a clinician’s current authorization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No assignments are available for this hospital.
          </p>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <article
                key={assignment.id}
                className="flex flex-col gap-3 rounded-xl border border-border/80 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{assignment.kind}</Badge>
                    <span className="text-sm font-medium">{assignmentLabel(assignment)}</span>
                    <span className="text-xs text-muted-foreground">v{assignment.version}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Membership {formatIdentifier(assignment.data.membership_id)} · Ends{" "}
                    {formatSecurityTime(assignment.data.ends_at)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => extend(assignment)}
                  disabled={mutation.isPending}
                >
                  <PencilSimpleIcon aria-hidden="true" /> Extend context
                </Button>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import type { SessionContext } from "@/lib/api/contracts/auth";
import { useContextAssignments, useHospitalPolicy } from "@/hooks/admin";
import { AdminHeader } from "./admin-header";
import { AssignmentList } from "./assignment-list";
import { HospitalPolicyForm } from "./hospital-policy-form";
import { SuspensionPanel } from "./suspension-panel";

export function AdminDashboard({ context }: { context: SessionContext }) {
  const assignments = useContextAssignments();
  const policy = useHospitalPolicy();
  const membershipIds = [
    ...new Set(assignments.data?.items.map((item) => item.data.membership_id) ?? []),
  ];
  const organization = context.organization;
  if (!organization) return null;
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-10 lg:py-10"
    >
      <AdminHeader organizationName={organization.name} />
      <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        {policy.data ? (
          <HospitalPolicyForm key={policy.data.version} policy={policy.data} />
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Hospital policy is unavailable.
          </div>
        )}
        <div className="space-y-6">
          <SuspensionPanel
            organizationId={organization.organization_id}
            membershipIds={membershipIds}
          />
          <div className="rounded-xl border border-border/70 bg-muted/25 p-5 text-sm leading-6 text-muted-foreground">
            Every administrative change is versioned and durably recorded. Suspension decisions do
            not erase prior audit evidence.
          </div>
        </div>
      </section>
      <section className="mt-6">
        <AssignmentList assignments={assignments.data?.items ?? []} />
      </section>
    </main>
  );
}

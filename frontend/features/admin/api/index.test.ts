import { beforeEach, describe, expect, test } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login, logout } from "@/features/auth/api";
import { getSecurityEvents } from "@/features/security/api";
import { installMockApi } from "@/lib/mock-api";
import type { AssignmentUpsert } from "@/lib/api/contracts/admin";
import { DEMO_UNITY_STREAM_ID } from "@/lib/mock-api/security";
import {
  getContextAssignments,
  getHospitalPolicy,
  suspendAdminTarget,
  updateHospitalPolicy,
  upsertContextAssignment,
} from ".";

describe("administration contract flow", () => {
  const runtime = installMockApi();

  beforeEach(() => {
    runtime.reset();
    clearApiSession();
  });

  test("reads and versions policy and duty context", async () => {
    await login({ username: "sarah.unity", password: "synthetic-example-password" });
    const policy = await getHospitalPolicy();
    expect(policy.break_glass_enabled).toBe(true);
    const assignments = await getContextAssignments();
    expect(assignments.items[0]?.kind).toBe("CARE");

    const updated = await updateHospitalPolicy({
      expected_version: policy.version,
      break_glass_enabled: policy.break_glass_enabled,
      eligible_roles: policy.eligible_roles,
      eligible_memberships: policy.eligible_memberships,
      source_normal_domains: policy.source_normal_domains,
      source_normal_max_sensitivity: policy.source_normal_max_sensitivity,
      source_emergency_roles: policy.source_emergency_roles,
      emergency_restricted_enabled: policy.emergency_restricted_enabled,
      source_emergency_level2_domains: policy.source_emergency_level2_domains,
    });
    expect(updated.version).toBe(policy.version + 1);

    const assignment = assignments.items[0]!;
    const revised = await upsertContextAssignment({
      kind: assignment.kind,
      assignment_id: assignment.id,
      expected_version: assignment.version,
      data: assignment.data,
    } as AssignmentUpsert);
    expect(revised.version).toBe(assignment.version + 1);
  });

  test("suspends a membership without creating a clinical record", async () => {
    await login({ username: "sarah.unity", password: "synthetic-example-password" });
    const result = await suspendAdminTarget({
      target_type: "MEMBERSHIP",
      target_id: "00000000-0000-4000-8000-000000000013",
      reason: "Suspend this membership while the security team completes its review.",
      expected_version: 1,
    });
    expect(result.status).toBe("SUSPENDED");
    expect(result.target_id).toBe("00000000-0000-4000-8000-000000000013");
    await expect(getSecurityEvents(DEMO_UNITY_STREAM_ID)).rejects.toMatchObject({
      code: "CONTEXT_DENIED",
      status: 403,
    });
  });

  test("allows the trust operator to suspend an organization", async () => {
    await login({ username: "trust.operator", password: "synthetic-example-password" });
    const result = await suspendAdminTarget({
      target_type: "ORGANIZATION",
      target_id: "00000000-0000-4000-8000-000000000003",
      reason: "Suspend the synthetic organization while the trust review is completed.",
      expected_version: 1,
    });
    expect(result.status).toBe("SUSPENDED");
    await logout();
    clearApiSession();
    await expect(
      login({ username: "sarah.unity", password: "synthetic-example-password" }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED", status: 401 });
  });
});

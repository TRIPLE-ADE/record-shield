import { beforeEach, describe, expect, test } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login, logout } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import {
  activateEmergency,
  revokeEmergency,
  submitEmergencyJustification,
} from "@/features/emergency/api";
import {
  DEMO_PATIENT_ID,
  DEMO_MERCY_ORGANIZATION_ID,
  DEMO_UNITY_ENCOUNTER_ID,
} from "@/lib/mock-api/records";
import { getWorklist } from ".";

describe("outstanding actions", () => {
  const runtime = installMockApi();
  beforeEach(() => {
    runtime.reset();
    clearApiSession();
  });
  test("keeps emergency reviews available after access ends, then removes completed work", async () => {
    await login({ username: "amina.unity", password: "synthetic-example-password" });
    const { session } = await activateEmergency({
      patient_id: DEMO_PATIENT_ID,
      source_org_id: DEMO_MERCY_ORGANIZATION_ID,
      receiving_encounter_id: DEMO_UNITY_ENCOUNTER_ID,
      reason_code: "IMMEDIATE_THREAT",
      necessity_confirmed: true,
    });
    await logout();
    clearApiSession();
    await login({ username: "sarah.unity", password: "synthetic-example-password" });
    await revokeEmergency({
      sessionId: session.id,
      input: {
        expected_version: session.version,
        reason: "Immediate treatment is complete and access is no longer needed.",
      },
    });
    await logout();
    clearApiSession();
    await login({ username: "amina.unity", password: "synthetic-example-password" });
    expect((await getWorklist()).items).toMatchObject([
      { id: session.id, type: "EMERGENCY_REVIEW", patient_name: "Musa Ibrahim" },
    ]);
    await logout();
    clearApiSession();
    await login({ username: "grace.unity", password: "synthetic-example-password" });
    expect((await getWorklist()).items).toEqual([]);
    await expect(
      submitEmergencyJustification({
        sessionId: session.id,
        input: { narrative: "This review must remain unavailable to another practitioner." },
      }),
    ).rejects.toMatchObject({ status: 404 });
    await logout();
    clearApiSession();
    await login({ username: "amina.unity", password: "synthetic-example-password" });
    await submitEmergencyJustification({
      sessionId: session.id,
      input: { narrative: "The allergy record was required to select safe immediate treatment." },
    });
    expect((await getWorklist()).items).toEqual([]);
  });
});

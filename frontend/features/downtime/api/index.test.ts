import { beforeEach, expect, test } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login } from "@/features/auth/api";
import { DEMO_PATIENT_ID, DEMO_UNITY_ENCOUNTER_ID } from "@/lib/mock-api/records";
import { installMockApi } from "@/lib/mock-api";
import { getDemoStatus, createDowntimeReconciliation, setDemoFault } from ".";

const runtime = installMockApi();

const reconciliation = {
  form_serial: "UNITY-DT-20260920-0001",
  patient_id: DEMO_PATIENT_ID,
  encounter_id: DEMO_UNITY_ENCOUNTER_ID,
  occurred_at: "2026-09-20T09:00:00Z",
  transcribed_at: "2026-09-20T09:50:00Z",
  transcriber_id: "00000000-0000-4000-8000-000000000006",
  clinical_reviewer_id: "00000000-0000-4000-8000-000000000006",
  local_entries: [{ record_id: "00000000-0000-4000-8000-000000000204", version: 1 }],
  outcome: "RECONCILED" as const,
};

beforeEach(async () => {
  runtime.reset();
  clearApiSession();
  await login({ username: "sarah.unity", password: "synthetic-example-password" });
});

test("reconciles a verified local entry and safely replays the form serial", async () => {
  const first = await createDowntimeReconciliation(reconciliation);
  const replay = await createDowntimeReconciliation(reconciliation);

  expect(first.form_serial).toBe(reconciliation.form_serial);
  expect(first.occurred_at).toBe(reconciliation.occurred_at);
  expect(replay.id).toBe(first.id);
  expect(replay.recorded_at).toBe(first.recorded_at);
});

test("rejects a second payload under the same form serial", async () => {
  await createDowntimeReconciliation(reconciliation);
  await expect(
    createDowntimeReconciliation({ ...reconciliation, outcome: "DISCREPANCY_REQUIRES_REVIEW" }),
  ).rejects.toMatchObject({ status: 409, code: "DUPLICATE_FORM_CONFLICT" });
});

test("fails closed when audit is unavailable", async () => {
  await setDemoFault({ dependency: "AUDIT", enabled: true });
  await expect(createDowntimeReconciliation(reconciliation)).rejects.toMatchObject({
    status: 503,
    code: "AUDIT_UNAVAILABLE",
  });
  const status = await getDemoStatus();
  expect(status.dependencies.AUDIT.available).toBe(false);
});

import { beforeEach, describe, expect, test } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { installMockApi } from "@/lib/mock-api";
import { DEMO_PATIENT_ID, DEMO_UNITY_ENCOUNTER_ID } from "@/lib/mock-api/records";
import { login } from "@/features/auth/api";
import { correctLocalRecord, createLocalRecord, getLocalRecords } from ".";

describe("local record contract flow", () => {
  const runtime = installMockApi();

  beforeEach(() => {
    runtime.reset();
    clearApiSession();
  });

  test("reads a known patient from the current Unity context", async () => {
    await login({ username: "grace.unity", password: "synthetic-example-password" });

    const result = await getLocalRecords({
      patientId: DEMO_PATIENT_ID,
      domain: "demographics",
      purpose: "treatment",
    });

    expect(result.source?.name).toBe("Unity Medical");
    expect(result.items[0]?.source.local_patient_id).toBe("HSP-99210");
    expect(result.items[0]?.payload).toMatchObject({ name: "Musa Ibrahim" });
  });

  test("projects administrative Mercy data while denying clinical payloads to a clerk", async () => {
    await login({ username: "john.mercy", password: "synthetic-example-password" });

    const demographics = await getLocalRecords({
      patientId: DEMO_PATIENT_ID,
      domain: "demographics",
      purpose: "administration",
    });
    expect(demographics.source?.name).toBe("Mercy General");
    expect(demographics.items[0]?.payload).toEqual({
      name: "Musa Ibrahim",
      date_of_birth: "1987-04-12",
      gender: "male",
      local_patient_id: "PAT-00291",
    });

    await expect(
      getLocalRecords({
        patientId: DEMO_PATIENT_ID,
        domain: "allergies",
        purpose: "administration",
      }),
    ).rejects.toMatchObject({ code: "POLICY_DENIED", status: 403 });
  });

  test("writes a Unity nursing note and rejects a stale correction without duplication", async () => {
    await login({ username: "grace.unity", password: "synthetic-example-password" });

    const created = await createLocalRecord({
      patientId: DEMO_PATIENT_ID,
      domain: "nursing_notes",
      input: {
        encounter_id: DEMO_UNITY_ENCOUNTER_ID,
        subtype: "nursing_note",
        observed_at: new Date().toISOString(),
        payload: { text: "Reviewed hydration and documented the evening plan." },
        references: [],
      },
    });

    expect(created.record.version).toBe(1);
    expect(created.record.source.organization_id).toBe("00000000-0000-4000-8000-000000000003");

    const corrected = await correctLocalRecord({
      recordId: created.record.id,
      version: 1,
      input: {
        payload: { text: "Reviewed hydration and documented the evening plan clearly." },
        correction_reason: "Clarified the wording to reflect the completed bedside review.",
      },
    });
    expect(corrected.record.version).toBe(2);
    expect(corrected.record.supersedes_id).toBe(created.record.version_id);

    await expect(
      correctLocalRecord({
        recordId: created.record.id,
        version: 1,
        input: {
          payload: { text: "A second correction should not overwrite the newer version." },
          correction_reason:
            "This request intentionally uses a stale version for the contract test.",
        },
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });

    const notes = await getLocalRecords({
      patientId: DEMO_PATIENT_ID,
      domain: "nursing_notes",
      purpose: "treatment",
    });
    expect(notes.items.filter((record) => record.id === created.record.id)).toHaveLength(1);
    expect(notes.items.find((record) => record.id === created.record.id)?.version).toBe(2);
  });
});

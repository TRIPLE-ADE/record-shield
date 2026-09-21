import { beforeEach, describe, expect, test } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login, logout } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import {
  DEMO_SECOND_PATIENT_ID,
  DEMO_SECOND_UNITY_ENCOUNTER_ID,
  DEMO_UNITY_ENCOUNTER_ID,
  DEMO_MERCY_ORGANIZATION_ID,
} from "@/lib/mock-api/records";
import { createConsentRequest, discoverSources } from "@/features/exchange/api";
import { getPatientContext } from ".";

describe("patient visit context", () => {
  const runtime = installMockApi();
  beforeEach(() => {
    runtime.reset();
    clearApiSession();
  });
  test("supports another authorized patient while rejecting a visit belonging to someone else", async () => {
    await login({ username: "amina.unity", password: "synthetic-example-password" });
    const context = await getPatientContext(DEMO_SECOND_PATIENT_ID);
    expect(context.patient.name).toBe("Ada Nwosu");
    expect(context.can_request_records).toBe(true);
    expect(context.can_activate_emergency).toBe(false);
    expect(context.encounters[0]?.id).toBe(DEMO_SECOND_UNITY_ENCOUNTER_ID);
    await expect(
      discoverSources({
        patientId: DEMO_SECOND_PATIENT_ID,
        receivingEncounterId: DEMO_UNITY_ENCOUNTER_ID,
      }),
    ).rejects.toMatchObject({ status: 404 });
    const result = await createConsentRequest({
      patient_id: DEMO_SECOND_PATIENT_ID,
      source_org_id: DEMO_MERCY_ORGANIZATION_ID,
      receiving_encounter_id: DEMO_SECOND_UNITY_ENCOUNTER_ID,
      purpose: "treatment",
      requested_domains: ["allergies"],
      reason: "Review allergy history for this patient’s current treatment.",
    });
    expect(result.request.patient_id).toBe(DEMO_SECOND_PATIENT_ID);
    await logout();
    clearApiSession();
    await login({ username: "musa.patient", password: "synthetic-example-password" });
    await expect(getPatientContext(DEMO_SECOND_PATIENT_ID)).rejects.toMatchObject({ status: 404 });
  });
});

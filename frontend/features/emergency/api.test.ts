import { beforeEach, describe, expect, test } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import {
  DEMO_MERCY_ORGANIZATION_ID,
  DEMO_PATIENT_ID,
  DEMO_UNITY_ENCOUNTER_ID,
} from "@/lib/mock-api/records";
import {
  activateEmergency,
  expandEmergency,
  getEmergencyRecords,
  getEmergencyStatus,
  submitEmergencyJustification,
} from "./api";

describe("emergency session contract flow", () => {
  const runtime = installMockApi();

  beforeEach(() => {
    runtime.reset();
    clearApiSession();
  });

  test("activates a bounded summary, expands one explicit domain, and records review", async () => {
    await login({ username: "amina.unity", password: "synthetic-example-password" });

    const activated = await activateEmergency({
      patient_id: DEMO_PATIENT_ID,
      source_org_id: DEMO_MERCY_ORGANIZATION_ID,
      receiving_encounter_id: DEMO_UNITY_ENCOUNTER_ID,
      reason_code: "IMMEDIATE_THREAT",
      necessity_confirmed: true,
    });

    expect(activated.session.status).toBe("ACTIVE_SUMMARY");
    expect(activated.session.level).toBe(1);
    expect(activated.summary.allergies.status).toBe("AVAILABLE");
    expect(activated.summary.allergies.items[0]?.text).toContain("Penicillin");

    const summary = await getEmergencyRecords({
      sessionId: activated.session.id,
      view: "summary",
    });
    expect(summary.view).toBe("summary");
    if (summary.view === "summary") {
      expect(summary.summary.active_medications.status).toBe("AVAILABLE");
      expect(JSON.stringify(summary)).not.toContain("Restricted result");
    }

    const expanded = await expandEmergency({
      sessionId: activated.session.id,
      input: {
        domains: ["allergies"],
        narrative: "Confirm the recorded reaction before selecting an immediate medication.",
        expected_version: activated.session.version,
      },
    });
    expect(expanded.view).toBe("expanded");
    if (expanded.view === "expanded") {
      expect(expanded.session.level).toBe(2);
      expect(expanded.records.items[0]?.domain).toBe("allergies");
    }

    const status = await getEmergencyStatus(activated.session.id);
    expect(status.session.expanded_domains).toEqual(["allergies"]);

    const justified = await submitEmergencyJustification({
      sessionId: activated.session.id,
      input: {
        narrative:
          "The emergency review confirmed the allergy record was needed for immediate treatment.",
      },
    });
    expect(justified.session.justification_status).toBe("SUBMITTED");
    expect(justified.justification.session_id).toBe(activated.session.id);
  });

  test("denies a clerk without revealing an emergency session or summary", async () => {
    await login({ username: "john.mercy", password: "synthetic-example-password" });

    await expect(
      activateEmergency({
        patient_id: DEMO_PATIENT_ID,
        source_org_id: DEMO_MERCY_ORGANIZATION_ID,
        receiving_encounter_id: DEMO_UNITY_ENCOUNTER_ID,
        reason_code: "UNCONSCIOUS",
        necessity_confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "POLICY_DENIED", status: 403 });
  });

  test("keeps restricted source policy outside the expansion boundary", async () => {
    await login({ username: "amina.unity", password: "synthetic-example-password" });
    const activated = await activateEmergency({
      patient_id: DEMO_PATIENT_ID,
      source_org_id: DEMO_MERCY_ORGANIZATION_ID,
      receiving_encounter_id: DEMO_UNITY_ENCOUNTER_ID,
      reason_code: "INCAPACITATED",
      necessity_confirmed: true,
    });

    await expect(
      expandEmergency({
        sessionId: activated.session.id,
        input: {
          domains: ["hiv"],
          narrative: "This restricted result is not needed under the current source policy.",
          expected_version: activated.session.version,
        },
      }),
    ).rejects.toMatchObject({ code: "POLICY_DENIED", status: 403 });
  });
});

import { beforeEach, describe, expect, test } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login, logout } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import {
  DEMO_MERCY_ORGANIZATION_ID,
  DEMO_PATIENT_ID,
  DEMO_UNITY_ENCOUNTER_ID,
} from "@/lib/mock-api/records";
import {
  approveConsent,
  createConsentRequest,
  discoverSources,
  getPortal,
  getRemoteRecords,
  listConsentRequests,
  revokeGrant,
} from "./api";

describe("exchange and consent contract flow", () => {
  const runtime = installMockApi();

  beforeEach(() => {
    runtime.reset();
    clearApiSession();
  });

  test("keeps the requester, patient approval, grant, and remote read on one contract path", async () => {
    await login({ username: "amina.unity", password: "synthetic-example-password" });
    const sources = await discoverSources({
      patientId: DEMO_PATIENT_ID,
      receivingEncounterId: DEMO_UNITY_ENCOUNTER_ID,
    });
    expect(sources.items[0]?.organization.name).toBe("Mercy General");

    const created = await createConsentRequest({
      patient_id: DEMO_PATIENT_ID,
      source_org_id: DEMO_MERCY_ORGANIZATION_ID,
      receiving_encounter_id: DEMO_UNITY_ENCOUNTER_ID,
      purpose: "treatment",
      requested_domains: ["allergies", "medications"],
      reason: "Review source records that are relevant to the current treatment plan.",
    });
    expect(created.request.status).toBe("PENDING");

    const ownRequests = await listConsentRequests(DEMO_PATIENT_ID);
    expect(ownRequests.items[0]?.request.id).toBe(created.request.id);
    expect(ownRequests.items[0]?.grant).toBeNull();

    await logout();
    clearApiSession();
    await login({ username: "musa.patient", password: "synthetic-example-password" });
    const portalBeforeApproval = await getPortal();
    expect(portalBeforeApproval.requests.items[0]?.reason).toContain("current treatment plan");

    const approved = await approveConsent({
      requestId: created.request.id,
      input: {
        selected_domains: ["allergies"],
        duration: "PT24H",
        expected_version: 1,
      },
    });
    expect(approved.grant.domains).toEqual(["allergies"]);
    expect(approved.request.version).toBe(2);

    await logout();
    clearApiSession();
    await login({ username: "amina.unity", password: "synthetic-example-password" });
    const approvedRequests = await listConsentRequests(DEMO_PATIENT_ID);
    const grant = approvedRequests.items[0]?.grant;
    expect(grant?.status).toBe("ACTIVE");

    const remote = await getRemoteRecords({
      patientId: DEMO_PATIENT_ID,
      sourceId: DEMO_MERCY_ORGANIZATION_ID,
      grantId: grant?.id ?? "",
      domains: ["allergies"],
    });
    expect(remote.source?.name).toBe("Mercy General");
    expect(remote.items[0]?.payload).toMatchObject({ substance: "Penicillin" });

    await logout();
    clearApiSession();
    await login({ username: "musa.patient", password: "synthetic-example-password" });
    const revoked = await revokeGrant({
      grantId: grant?.id ?? "",
      input: { expected_version: 1 },
    });
    expect(revoked.grant.status).toBe("REVOKED");

    await logout();
    clearApiSession();
    await login({ username: "amina.unity", password: "synthetic-example-password" });
    await expect(
      getRemoteRecords({
        patientId: DEMO_PATIENT_ID,
        sourceId: DEMO_MERCY_ORGANIZATION_ID,
        grantId: grant?.id ?? "",
        domains: ["allergies"],
      }),
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED", status: 403 });
  });

  test("does not let a clerk discover or create a cross-hospital request", async () => {
    await login({ username: "john.mercy", password: "synthetic-example-password" });

    await expect(
      discoverSources({
        patientId: DEMO_PATIENT_ID,
        receivingEncounterId: DEMO_UNITY_ENCOUNTER_ID,
      }),
    ).rejects.toMatchObject({ code: "POLICY_DENIED", status: 403 });
  });
});

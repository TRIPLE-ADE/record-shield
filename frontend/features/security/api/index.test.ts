import { beforeEach, describe, expect, test } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login, logout } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import { getLocalRecords } from "@/features/patient-records/api";
import { DEMO_EXCHANGE_STREAM_ID, DEMO_UNITY_STREAM_ID } from "@/lib/mock-api/security";
import { getSecurityAlerts, getSecurityEvents, reviewSecurityAlert, verifySecurityChain } from ".";

describe("security evidence contract flow", () => {
  const runtime = installMockApi();

  beforeEach(() => {
    runtime.reset();
    clearApiSession();
  });

  test("reads safe stream metadata, verifies the chain, and advances an alert review", async () => {
    await login({ username: "sarah.unity", password: "synthetic-example-password" });
    const events = await getSecurityEvents(DEMO_UNITY_STREAM_ID);
    expect(events.items).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain("Restricted result");

    const alerts = await getSecurityAlerts(DEMO_UNITY_STREAM_ID);
    expect(alerts.items[0]?.status).toBe("REVIEW_REQUIRED");
    const reviewed = await reviewSecurityAlert({
      alertId: alerts.items[0]!.id,
      input: {
        target_status: "IN_REVIEW",
        expected_version: alerts.items[0]!.version,
        explanation: "The emergency event is being reviewed against the recorded work context.",
      },
    });
    expect(reviewed.alert.status).toBe("IN_REVIEW");
    expect(reviewed.alert.reviewer_id).not.toBe(reviewed.alert.actor_id);

    const verification = await verifySecurityChain(DEMO_UNITY_STREAM_ID);
    expect(verification.status).toBe("VALID");
    expect(verification.checked_to).toBeGreaterThanOrEqual(2);
  });

  test("does not expose the local stream to a clinical clerk", async () => {
    await login({ username: "john.mercy", password: "synthetic-example-password" });
    await expect(getSecurityEvents(DEMO_UNITY_STREAM_ID)).rejects.toMatchObject({
      code: "POLICY_DENIED",
      status: 403,
    });
  });

  test("gives the trust operator only the exchange stream", async () => {
    await login({ username: "trust.operator", password: "synthetic-example-password" });
    const events = await getSecurityEvents(DEMO_EXCHANGE_STREAM_ID);
    expect(events.items[0]?.stream_id).toBe(DEMO_EXCHANGE_STREAM_ID);
    await expect(getSecurityEvents(DEMO_UNITY_STREAM_ID)).rejects.toMatchObject({
      code: "POLICY_DENIED",
      status: 403,
    });
  });

  test("keeps review evidence available after the reviewer signs out", async () => {
    await login({ username: "sarah.unity", password: "synthetic-example-password" });
    const alerts = await getSecurityAlerts(DEMO_UNITY_STREAM_ID);
    await reviewSecurityAlert({
      alertId: alerts.items[0]!.id,
      input: {
        target_status: "IN_REVIEW",
        expected_version: alerts.items[0]!.version,
        explanation: "The security team is retaining the original alert while reviewing context.",
      },
    });
    await logout();
    clearApiSession();
    await login({ username: "sarah.unity", password: "synthetic-example-password" });
    const refreshed = await getSecurityAlerts(DEMO_UNITY_STREAM_ID);
    expect(refreshed.items[0]?.status).toBe("IN_REVIEW");
  });

  test("creates one high alert after five denied reads in the rolling window", async () => {
    await login({ username: "sarah.unity", password: "synthetic-example-password" });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        getLocalRecords({
          patientId: "00000000-0000-4000-8000-000000000001",
          domain: "medications",
          purpose: "treatment",
        }),
      ).rejects.toMatchObject({ code: "POLICY_DENIED", status: 403 });
    }
    const alerts = await getSecurityAlerts(DEMO_UNITY_STREAM_ID);
    expect(alerts.items.filter((alert) => alert.rule_id === "AR01")).toHaveLength(1);
    expect(alerts.items.find((alert) => alert.rule_id === "AR01")?.severity).toBe("HIGH");
  });

  test("keeps a chain failure as a critical alert after tampering", async () => {
    runtime.service.tamperSecurityStream(DEMO_UNITY_STREAM_ID, "HASH");
    await login({ username: "sarah.unity", password: "synthetic-example-password" });
    const verification = await verifySecurityChain(DEMO_UNITY_STREAM_ID);
    expect(verification.status).toBe("INVALID");
    expect(verification.reason).toBe("LINK_MISMATCH");
    const alerts = await getSecurityAlerts(DEMO_UNITY_STREAM_ID, { ruleId: "AR09" });
    expect(alerts.items[0]?.severity).toBe("CRITICAL");
    expect(alerts.items[0]?.status).toBe("REVIEW_REQUIRED");
  });
});

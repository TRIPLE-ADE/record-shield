import { beforeEach, describe, expect, test } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login, logout } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import {
  DEMO_PATIENT_ID,
  DEMO_MERCY_ORGANIZATION_ID,
  DEMO_UNITY_ENCOUNTER_ID,
} from "@/lib/mock-api/records";
import { createConsentRequest, getPortal, markNotificationRead } from ".";

describe("patient notification ownership", () => {
  const runtime = installMockApi();
  beforeEach(() => {
    runtime.reset();
    clearApiSession();
  });
  test("acknowledges once without changing consent and hides another patient’s notifications", async () => {
    await login({ username: "amina.unity", password: "synthetic-example-password" });
    await createConsentRequest({
      patient_id: DEMO_PATIENT_ID,
      source_org_id: DEMO_MERCY_ORGANIZATION_ID,
      receiving_encounter_id: DEMO_UNITY_ENCOUNTER_ID,
      purpose: "treatment",
      requested_domains: ["allergies"],
      reason: "Review allergy history before selecting immediate treatment.",
    });
    await logout();
    clearApiSession();
    await login({ username: "musa.patient", password: "synthetic-example-password" });
    const before = await getPortal();
    const notification = before.notifications.items[0]!;
    expect(notification.seen_at).toBeNull();
    const acknowledged = await markNotificationRead(notification.id);
    expect(acknowledged.notification.seen_at).toBeTruthy();
    expect((await markNotificationRead(notification.id)).notification.seen_at).toBe(
      acknowledged.notification.seen_at,
    );
    expect((await getPortal()).requests.items[0]?.status).toBe("PENDING");
    await logout();
    clearApiSession();
    await login({ username: "ada.patient", password: "synthetic-example-password" });
    expect((await getPortal()).notifications.items).toEqual([]);
    await expect(markNotificationRead(notification.id)).rejects.toMatchObject({ status: 404 });
  });
});

import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login, logout } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import {
  DEMO_MERCY_ORGANIZATION_ID,
  DEMO_PATIENT_ID,
  DEMO_UNITY_ENCOUNTER_ID,
} from "@/lib/mock-api/records";
import { QueryProvider } from "@/lib/query/provider";
import { createConsentRequest } from "@/features/exchange/api";
import PortalPage from ".";

vi.mock("next/navigation", () => ({
  default: {},
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const runtime = installMockApi();

beforeEach(async () => {
  runtime.reset();
  clearApiSession();
  await login({ username: "amina.unity", password: "synthetic-example-password" });
  await createConsentRequest({
    patient_id: DEMO_PATIENT_ID,
    source_org_id: DEMO_MERCY_ORGANIZATION_ID,
    receiving_encounter_id: DEMO_UNITY_ENCOUNTER_ID,
    purpose: "treatment",
    requested_domains: ["allergies", "medications"],
    reason: "Review source records that are relevant to the current treatment plan.",
  });
  await logout();
  clearApiSession();
  await login({ username: "musa.patient", password: "synthetic-example-password" });
});

test("lets the patient choose an exact domain and approve a time-limited grant", async () => {
  render(
    <QueryProvider>
      <PortalPage />
    </QueryProvider>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: /Review who can access/ }))
    .toBeVisible();
  await userEvent.click(page.getByRole("checkbox", { name: "Allergies" }));
  await userEvent.click(page.getByRole("button", { name: "Approve selected access" }));

  await expect.element(page.getByText(/Dr Amina Yusuf · Mercy General/)).toBeVisible();
  await expect.element(page.getByText(/Allergies · expires/)).toBeVisible();
});

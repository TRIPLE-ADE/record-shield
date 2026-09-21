import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { QueryProvider } from "@/lib/query/provider";
import { clearApiSession } from "@/lib/api/client";
import { installMockApi } from "@/lib/mock-api";
import { login, logout } from "@/features/auth/api";
import { createConsentRequest } from "@/features/exchange/api";
import {
  DEMO_PATIENT_ID,
  DEMO_MERCY_ORGANIZATION_ID,
  DEMO_UNITY_ENCOUNTER_ID,
} from "@/lib/mock-api/records";
import AccessRequestsPage from ".";

vi.mock("next/navigation", () => ({ default: {}, redirect: vi.fn() }));
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
    requested_domains: ["allergies"],
    reason: "Review allergy records for this treatment plan.",
  });
});

test("shows an actionable request and separates pending from approved access", async () => {
  render(
    <QueryProvider>
      <AccessRequestsPage />
    </QueryProvider>,
  );
  await expect.element(page.getByText("Musa Ibrahim")).toBeVisible();
  await expect.element(page.getByText("Pending", { exact: true })).toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "Open request" }))
    .toHaveAttribute("href", `/workspace/patients/${DEMO_PATIENT_ID}/exchange`);
  await userEvent.selectOptions(
    page.getByRole("combobox", { name: "Filter loaded requests" }),
    "ready",
  );
  await expect.element(page.getByText("No matching requests loaded")).toBeVisible();
  await expect.element(page.getByRole("link", { name: "Open request" })).not.toBeInTheDocument();
});

test("keeps another clinician's requests out of the inbox", async () => {
  await logout();
  clearApiSession();
  await login({ username: "grace.unity", password: "synthetic-example-password" });
  render(
    <QueryProvider>
      <AccessRequestsPage />
    </QueryProvider>,
  );
  await expect.element(page.getByText("No requests yet")).toBeVisible();
  await expect
    .element(page.getByText("Review allergy records for this treatment plan."))
    .not.toBeInTheDocument();
});

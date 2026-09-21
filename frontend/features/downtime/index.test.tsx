import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import { DEMO_PATIENT_ID, DEMO_UNITY_ENCOUNTER_ID } from "@/lib/mock-api/records";
import { QueryProvider } from "@/lib/query/provider";
import DowntimePage from ".";

vi.mock("next/navigation", () => ({
  default: {},
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const runtime = installMockApi();

beforeEach(async () => {
  runtime.reset();
  clearApiSession();
  await login({ username: "sarah.unity", password: "synthetic-example-password" });
});

test("shows resilience dependencies and submits a paper form reconciliation", async () => {
  render(
    <QueryProvider>
      <DowntimePage />
    </QueryProvider>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: /Downtime and demo hardening/ }))
    .toBeVisible();
  await expect.element(page.getByText("Dependency readiness")).toBeVisible();
  await expect.element(page.getByText("Demo rehearsal controls")).toBeVisible();

  await userEvent.fill(page.getByRole("textbox", { name: "Form serial" }), "UNITY-DT-UI-0001");
  await userEvent.fill(
    page.getByRole("textbox", { name: "Encounter ID" }),
    DEMO_UNITY_ENCOUNTER_ID,
  );
  await userEvent.fill(
    page.getByRole("textbox", { name: "Transcriber ID" }),
    "00000000-0000-4000-8000-000000000006",
  );
  await userEvent.fill(
    page.getByRole("textbox", { name: "Clinical reviewer ID" }),
    "00000000-0000-4000-8000-000000000006",
  );
  await userEvent.fill(
    page.getByRole("textbox", { name: "Local record ID" }),
    "00000000-0000-4000-8000-000000000204",
  );
  await userEvent.click(page.getByRole("button", { name: "Reconcile paper form" }));

  await expect.element(page.getByText("Reconciliation recorded")).toBeVisible();
  await expect.element(page.getByText("UNITY-DT-UI-0001")).toBeVisible();
  expect(DEMO_PATIENT_ID).toHaveLength(36);
});

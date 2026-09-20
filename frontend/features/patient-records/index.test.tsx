import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import { DEMO_PATIENT_ID } from "@/lib/mock-api/records";
import { QueryProvider } from "@/lib/query/provider";
import PatientRecordsPage from ".";

vi.mock("next/navigation", () => ({
  default: {},
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const runtime = installMockApi();

beforeEach(async () => {
  runtime.reset();
  clearApiSession();
  await login({ username: "grace.unity", password: "synthetic-example-password" });
});

test("shows a patient workspace and an in-context nursing write form", async () => {
  render(
    <QueryProvider>
      <PatientRecordsPage patientId={DEMO_PATIENT_ID} />
    </QueryProvider>,
  );

  await expect.element(page.getByRole("heading", { level: 1, name: "Musa Ibrahim" })).toBeVisible();
  await expect.element(page.getByText("HSP-99210 · Unity Medical")).toBeVisible();
  await expect.element(page.getByText("Patient workspace")).toBeVisible();

  await userEvent.click(page.getByRole("button", { name: "Nursing" }));
  await expect
    .element(page.getByRole("heading", { level: 2, name: "Nursing notes" }))
    .toBeVisible();
  await expect.element(page.getByText("Add nursing note")).toBeVisible();
  await expect.element(page.getByText(/Patient resting comfortably/)).toBeVisible();
});

test("submits a nursing note through the contract-backed form", async () => {
  render(
    <QueryProvider>
      <PatientRecordsPage patientId={DEMO_PATIENT_ID} />
    </QueryProvider>,
  );

  await userEvent.click(page.getByRole("button", { name: "Nursing" }));
  const note = page.getByRole("textbox", { name: "Note" });
  await userEvent.fill(note, "Checked the patient and updated the evening care plan.");
  await userEvent.click(page.getByRole("button", { name: "Save note" }));

  await expect
    .element(page.getByText("Checked the patient and updated the evening care plan."))
    .toBeVisible();
});

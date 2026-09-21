import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import { DEMO_PATIENT_ID } from "@/lib/mock-api/records";
import { QueryProvider } from "@/lib/query/provider";
import EmergencyPage from ".";

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
});

test("activates a bounded summary before offering explicit expansion", async () => {
  render(
    <QueryProvider>
      <EmergencyPage patientId={DEMO_PATIENT_ID} />
    </QueryProvider>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Open an emergency patient summary" }))
    .toBeVisible();
  await userEvent.selectOptions(
    page.getByRole("combobox", { name: "Source facility" }),
    "00000000-0000-4000-8000-000000000002",
  );
  await userEvent.click(page.getByRole("checkbox", { name: /I confirm this is necessary now/ }));
  await userEvent.click(page.getByRole("button", { name: "Activate emergency summary" }));

  await expect
    .element(page.getByRole("heading", { name: "Emergency patient summary" }))
    .toBeVisible();
  await expect.element(page.getByText(/Penicillin — Rash; moderate; active/)).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Choose additional records" }))
    .toBeVisible();
});

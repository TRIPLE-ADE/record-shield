import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import { DEMO_PATIENT_ID } from "@/lib/mock-api/records";
import { QueryProvider } from "@/lib/query/provider";
import ExchangePage from ".";

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

test("defines a source request from a verified receiving context", async () => {
  render(
    <QueryProvider>
      <ExchangePage patientId={DEMO_PATIENT_ID} />
    </QueryProvider>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Request source records" }))
    .toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Select Mercy General" }));
  await userEvent.click(page.getByRole("checkbox", { name: "Allergies" }));
  await userEvent.fill(
    page.getByRole("textbox", { name: "Patient-visible reason" }),
    "Review relevant source allergies before confirming the current treatment plan.",
  );
  await userEvent.click(page.getByRole("button", { name: "Send consent request" }));

  await expect.element(page.getByText(/Review relevant source allergies/)).toBeVisible();
  await expect.element(page.getByText("Pending")).toBeVisible();
});

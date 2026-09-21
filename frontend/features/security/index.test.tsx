import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { QueryProvider } from "@/lib/query/provider";
import { clearApiSession } from "@/lib/api/client";
import { installMockApi } from "@/lib/mock-api";
import { login } from "@/features/auth/api";
import SecurityPage from ".";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const runtime = installMockApi();

beforeEach(async () => {
  runtime.reset();
  clearApiSession();
  await login({ username: "sarah.unity", password: "synthetic-example-password" });
});

test("renders stream-scoped alerts and verifies the audit chain", async () => {
  render(
    <QueryProvider>
      <SecurityPage />
    </QueryProvider>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Security evidence" }))
    .toBeVisible();
  await expect.element(page.getByText("EMERGENCY ACTIVATED")).toBeVisible();
  await page.getByRole("button", { name: "Verify chain" }).click();
  await expect.element(page.getByText("VALID")).toBeVisible();
  await page.getByRole("tab", { name: "Event stream" }).click();
  await expect.element(page.getByText("ROLE DOMAIN DENIED")).toBeVisible();
});

test("requires a review explanation before changing an alert", async () => {
  render(
    <QueryProvider>
      <SecurityPage />
    </QueryProvider>,
  );

  await page.getByRole("button", { name: "Review" }).click();
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Start review" }).click();
  await expect.element(page.getByRole("textbox", { name: "Review explanation" })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Review explanation" })
    .fill("The recorded emergency context is being reviewed by security.");
  await page.getByRole("button", { name: "Start review" }).click();
  await expect.element(page.getByText("In review")).toBeVisible();
});

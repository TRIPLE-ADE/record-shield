import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { QueryProvider } from "@/lib/query/provider";
import { clearApiSession } from "@/lib/api/client";
import { installMockApi } from "@/lib/mock-api";
import { login } from "@/features/auth/api";
import AdminPage from ".";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const runtime = installMockApi();

beforeEach(async () => {
  runtime.reset();
  clearApiSession();
  await login({ username: "sarah.unity", password: "synthetic-example-password" });
});

test("renders hospital policy and duty context controls", async () => {
  render(
    <QueryProvider>
      <AdminPage />
    </QueryProvider>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Administration" }))
    .toBeVisible();
  await expect.element(page.getByText("Emergency policy")).toBeVisible();
  await expect.element(page.getByText("Care relationship")).toBeVisible();
  await expect.element(page.getByRole("button", { name: "Save policy" })).toBeVisible();
});

test("renders trust-operator suspension controls without hospital policy editing", async () => {
  runtime.reset();
  clearApiSession();
  await login({ username: "trust.operator", password: "synthetic-example-password" });
  render(
    <QueryProvider>
      <AdminPage />
    </QueryProvider>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Administration" }))
    .toBeVisible();
  await expect.element(page.getByText("Trust network")).toBeVisible();
  await expect
    .element(page.getByRole("textbox", { name: "Target reference" }))
    .toHaveAttribute("placeholder", "Canonical organization or membership ID");
  await expect.element(page.getByText("Emergency policy")).not.toBeInTheDocument();
});

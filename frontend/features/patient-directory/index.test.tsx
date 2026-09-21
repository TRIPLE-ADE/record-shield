import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import { QueryProvider } from "@/lib/query/provider";
import PatientDirectoryPage from ".";

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

test("shows every patient returned for the active care context", async () => {
  render(
    <QueryProvider>
      <PatientDirectoryPage />
    </QueryProvider>,
  );

  await expect.element(page.getByRole("heading", { level: 1, name: "My patients" })).toBeVisible();
  await expect.element(page.getByText("Musa Ibrahim")).toBeVisible();
  await expect.element(page.getByText("Ada Nwosu")).toBeVisible();
  await expect.element(page.getByText("2 shown")).toBeVisible();
});

test("searches the authorized patient directory through the API", async () => {
  render(
    <QueryProvider>
      <PatientDirectoryPage />
    </QueryProvider>,
  );

  const search = page.getByRole("textbox", { name: "Search patients" });
  await search.fill("Ada");

  await expect.element(page.getByText("Ada Nwosu")).toBeVisible();
  await expect.element(page.getByText("Musa Ibrahim")).not.toBeInTheDocument();
});

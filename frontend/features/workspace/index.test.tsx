import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { QueryProvider } from "@/lib/query/provider";
import { clearApiSession } from "@/lib/api/client";
import { installMockApi } from "@/lib/mock-api";
import { login } from "@/features/auth/api";
import WorkspacePage from ".";

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
  await login({ username: "amina.unity", password: "synthetic-example-password" });
});

test("renders workspace context from the authenticated session", async () => {
  render(
    <QueryProvider>
      <WorkspacePage />
    </QueryProvider>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: /Good to see you/ }))
    .toBeVisible();
  await expect.element(page.getByText("Unity Medical")).toBeVisible();
  await expect.element(page.getByText("Emergency Doctor")).toBeVisible();
});

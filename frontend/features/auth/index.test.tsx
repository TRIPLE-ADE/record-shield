import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { expect, test, vi } from "vitest";
import { QueryProvider } from "@/lib/query/provider";
import LoginPage from ".";

vi.mock("next/navigation", () => ({
  default: {},
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

test("offers named synthetic identities without implying client-side authority", async () => {
  render(
    <QueryProvider>
      <LoginPage />
    </QueryProvider>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1 }))
    .toHaveTextContent("Start with the person, then the permission.");
  await expect
    .element(page.getByRole("button", { name: /Amina Yusuf/ }))
    .toHaveAttribute("aria-pressed", "true");

  await userEvent.click(page.getByRole("button", { name: /Kunle Adeyemi/ }));
  await expect.element(page.getByRole("textbox", { name: "Username" })).toHaveValue("kunle.mercy");
  await expect
    .element(page.getByText("The selected card never grants a role or hospital."))
    .toBeVisible();
});

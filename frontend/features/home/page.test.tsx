import { QueryProvider } from "@/lib/query/provider";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { expect, test } from "vitest";
import HomePage from ".";

function renderHome() {
  return render(
    <QueryProvider>
      <HomePage />
    </QueryProvider>,
  );
}

test("renders the workspace from the API-shaped dashboard response", async () => {
  renderHome();

  await expect
    .element(page.getByRole("heading", { level: 1 }))
    .toHaveTextContent("Review care context with confidence.");
  await expect.element(page.getByRole("banner").getByText("Unity Medical")).toBeVisible();
  await expect.element(page.getByText("Workspace ready for review.").first()).toBeVisible();
});

test("keeps denied access explicit while retaining the source context", async () => {
  renderHome();

  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Denied" }));

  await expect.element(page.getByText("This scope is not available")).toBeVisible();
  await expect
    .element(page.getByText("No clinical payload was returned.", { exact: false }))
    .toBeVisible();
});

import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { expect, test } from "vitest";
import HomePage from ".";

test("keeps the home route focused on the product foundation", async () => {
  render(<HomePage />);

  await expect
    .element(page.getByRole("heading", { level: 1 }))
    .toHaveTextContent("A calmer way to build clinical trust.");
  await expect.element(page.getByRole("link", { name: /Enter workspace/i })).toBeVisible();
  await expect.element(page.getByRole("link", { name: /View design system/i })).toBeVisible();
  await expect.element(page.getByText("No live patient data")).toBeVisible();
});

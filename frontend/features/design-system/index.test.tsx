import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { expect, test } from "vitest";
import DesignSystemPage from ".";

test("communicates the design system purpose and trusted context", async () => {
  render(<DesignSystemPage />);

  await expect
    .element(page.getByRole("heading", { level: 1 }))
    .toHaveTextContent("Small parts. Clear states.");
  await expect.element(page.getByRole("link", { name: "Review components" })).toBeVisible();
});

test("shows failure states without exposing clinical content", async () => {
  render(<DesignSystemPage />);

  await userEvent.click(page.getByRole("button", { name: "Denied" }));

  await expect.element(page.getByText("This scope is not available")).toBeVisible();
  await expect
    .element(page.getByText("No clinical payload was returned.", { exact: false }))
    .toBeVisible();
});

test("keeps restricted scope explicit and reviewable", async () => {
  render(<DesignSystemPage />);

  const restrictedDomain = page.getByRole("checkbox", { name: /HIV status/i });
  await userEvent.click(restrictedDomain);

  await expect.element(restrictedDomain).toBeChecked();
  await expect.element(page.getByText("3 domains selected.")).toBeVisible();

  await userEvent.click(page.getByRole("button", { name: "Request specific domain" }));
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "Request a restricted domain" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Request restricted access" }))
    .toBeDisabled();
});

test("surfaces integrity failure and records alert review", async () => {
  render(<DesignSystemPage />);

  await userEvent.click(page.getByRole("button", { name: "Simulate failure" }));
  await expect.element(page.getByText("Integrity failure")).toBeVisible();

  await userEvent.click(page.getByRole("button", { name: "Review alert" }));
  await expect.element(page.getByRole("button", { name: "Review recorded" })).toBeVisible();
  await expect
    .element(page.getByText("Alert review recorded with reviewer context."))
    .toBeVisible();
});

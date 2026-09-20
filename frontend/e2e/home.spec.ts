import { expect, test } from "@playwright/test";

test("home keeps the product foundation intentionally simple", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("RecordShield · Clinical trust layer");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A calmer way to build clinical trust.",
  );
  await expect(page.getByRole("link", { name: /Open design system/i })).toBeVisible();
  await expect(page.getByText("No live patient data")).toBeVisible();
});

test("design system is available as a separate preview route", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Small parts. Clear states.");
  await expect(page.getByText("Component reference · representative states only")).toBeVisible();
});

test("restricted disclosure requires a necessity narrative", async ({ page }) => {
  await page.goto("/design-system");

  await page.locator('[data-slot="button"]').filter({ hasText: "Request specific domain" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const confirmButton = page.getByRole("button", { name: "Request restricted access" });
  await expect(confirmButton).toBeDisabled();
  await page
    .getByLabel("Why is this needed for immediate treatment?")
    .fill("The treatment decision depends on this restricted history right now.");
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
  await expect(
    page.getByText("Restricted scope request staged for patient approval."),
  ).toBeVisible();
});

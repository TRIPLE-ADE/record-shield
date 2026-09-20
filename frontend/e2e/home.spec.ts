import { expect, test } from "@playwright/test";

test("workspace surfaces trusted context and safety states", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("RecordShield · Clinical trust layer");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Review care context with confidence.",
  );
  await expect(page.getByText("Synthetic environment · no real patient data")).toBeVisible();

  await page.locator('[data-slot="button"]').filter({ hasText: "Denied" }).click();
  await expect(page.getByText("This scope is not available")).toBeVisible();
  await expect(page.getByText("No clinical payload was returned.", { exact: false })).toBeVisible();
});

test("design system is available as a separate preview route", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A quiet system for high-stakes decisions.",
  );
  await expect(page.getByText("Component preview · representative states only")).toBeVisible();
});

test("restricted disclosure requires a necessity narrative", async ({ page }) => {
  await page.goto("/");

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

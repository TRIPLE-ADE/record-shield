import { expect, test } from "@playwright/test";

test("home keeps the product foundation intentionally simple", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("RecordShield · Clinical trust layer");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A calmer way to build clinical trust.",
  );
  await expect(page.getByRole("link", { name: /Enter workspace/i })).toBeVisible();
  await expect(page.getByText("No live patient data")).toBeVisible();
});

test("requires an authenticated context before showing the workspace", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Start with the person, then the permission.",
  );
});

test("signs in with a seeded identity and renders server context", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Amina Yusuf" }).click();
  await page.getByRole("button", { name: "Enter workspace" }).click();

  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Good to see you/);
  await expect(page.getByText("Unity Medical")).toBeVisible();
  await expect(page.getByText("Emergency Doctor")).toBeVisible();
  await expect(
    page.getByText("No clinical payload has been requested on this page."),
  ).toBeVisible();
});

test("logout clears the protected workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "John Mensah" }).click();
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page).toHaveURL(/\/workspace$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
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

import { expect, test } from "@playwright/test";

test("root sends unauthenticated users to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle("RecordShield · Clinical trust layer");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Start with the person, then the permission.",
  );
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
  await expect(page.locator("#main-content").getByText("Unity Medical")).toBeVisible();
  await expect(page.locator("#main-content").getByText("Emergency Doctor")).toBeVisible();
});

test("opens the current patient context and writes a local nursing note", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Grace Okafor" }).click();
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page).toHaveURL(/\/workspace$/);

  await page.getByRole("link", { name: "Open current encounter" }).click();
  await expect(page).toHaveURL(/\/workspace\/patients\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Musa Ibrahim");
  await expect(page.getByText("HSP-99210 · Unity Medical")).toBeVisible();

  await page.getByRole("button", { name: "Nursing" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Nursing notes");
  await page
    .getByRole("textbox", { name: "Note" })
    .fill("The evening observation was reviewed with the care team.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(
    page.getByText("The evening observation was reviewed with the care team."),
  ).toBeVisible();
});

test("activates a bounded emergency summary and requests one explicit domain", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Amina Yusuf" }).click();
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await page.getByRole("link", { name: "Open current encounter" }).click();
  await page.getByRole("link", { name: "Open emergency summary" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Activate a bounded patient summary",
  );
  await page.getByLabel("Source facility").selectOption("00000000-0000-4000-8000-000000000002");
  await page.getByRole("checkbox", { name: /I confirm this is necessary now/ }).check();
  await page.getByRole("button", { name: "Activate emergency summary" }).click();

  await expect(page.getByRole("heading", { name: "Bounded clinical summary" })).toBeVisible();
  await expect(page.getByText(/Penicillin — Rash; moderate; active/)).toBeVisible();
  await page.getByRole("button", { name: "Choose Level 2 domains" }).click();
  await page.getByRole("checkbox", { name: "Allergies" }).check();
  await page
    .getByLabel("Why is this needed for immediate treatment?")
    .fill("Confirm the recorded allergy before selecting an immediate medication.");
  await page.getByRole("button", { name: "Request Level 2 access" }).click();
  await expect(page.getByText("Level 2 records")).toBeVisible();
});

test("completes a patient-approved source exchange", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Amina Yusuf" }).click();
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await page.getByRole("link", { name: "Open current encounter" }).click();
  await page.getByRole("link", { name: "Request source access" }).click();

  await page.getByRole("button", { name: "Select Mercy General" }).click();
  await page.getByRole("checkbox", { name: "Allergies" }).click();
  await page
    .getByRole("textbox", { name: "Patient-visible reason" })
    .fill("Review source allergies before confirming the current treatment plan.");
  await page.getByRole("button", { name: "Send consent request" }).click();
  await expect(page.getByRole("button", { name: "Cancel request" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: "Musa Ibrahim" }).click();
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await page.goto("/portal");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Review who can access/);
  const pendingRequest = page
    .locator("form")
    .filter({ hasText: "Review source allergies" })
    .first();
  await pendingRequest.getByRole("checkbox", { name: "Allergies" }).click();
  await pendingRequest.getByRole("button", { name: "Approve selected access" }).click();
  await expect(page.getByText(/Dr Amina Yusuf · Mercy General/).first()).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: "Amina Yusuf" }).click();
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await page.getByRole("link", { name: "Open current encounter" }).click();
  await page.getByRole("link", { name: "Request source access" }).click();
  await expect(page.getByText(/Penicillin/)).toBeVisible();
  await expect(page.getByText("Read only")).toBeVisible();
});

test("logout clears the protected workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "John Mensah" }).click();
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page).toHaveURL(/\/workspace$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("design system is development-only", async ({ page }) => {
  const response = await page.goto("/design-system");

  if (process.env.CI) {
    expect(response?.status()).toBe(404);
    return;
  }

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Small parts. Clear states.");
  await expect(page.getByText(/Representative examples only; contract-backed/)).toBeVisible();
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

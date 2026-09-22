import { expect, test } from "@playwright/test";

test("public landing page explains the product and opens sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("RecordShield — Connected care. Accountable access.");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Care moves.");
  await page.getByText("Do we need to replace our hospital software?", { exact: true }).click();
  await expect(page.getByText(/RecordShield is designed for two paths/)).toBeVisible();
  await page.getByRole("link", { name: "Explore the product", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("landing page fits a mobile screen and keeps sign in available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("requires an authenticated context before showing the workspace", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "The right records.At the point of care.",
  );
});

test("signs in with a seeded identity and renders server context", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Explore with a sample account").click();
  await page.getByRole("button", { name: "Amina Yusuf" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home");
  await expect(
    page.locator("#main-content").getByText("Unity Medical / Emergency Doctor"),
  ).toBeVisible();
});

test("opens the current patient context and writes a local nursing note", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Explore with a sample account").click();
  await page.getByRole("button", { name: "Grace Okafor" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/workspace$/);

  await page.getByRole("link", { name: "Open records for Musa Ibrahim" }).click();
  await expect(page).toHaveURL(/\/workspace\/patients\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Musa Ibrahim");
  await expect(page.getByText("HSP-99210 · Unity Medical")).toBeVisible();

  await page.getByRole("button", { name: "Nursing" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Nursing notes");
  await page
    .getByRole("textbox", { name: "Note" })
    .fill("The evening observation was reviewed with the care team.");
  await page.getByRole("button", { name: "Vitals", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Leave this unsaved entry?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByRole("textbox", { name: "Note" })).toHaveValue(
    "The evening observation was reviewed with the care team.",
  );
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(
    page.getByText("The evening observation was reviewed with the care team."),
  ).toBeVisible();
});

test("lists every patient assigned to the active care context", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Explore with a sample account").click();
  await page.getByRole("button", { name: "Grace Okafor" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Patients", exact: true }).click();

  await expect(page).toHaveURL(/\/workspace\/patients$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My patients");
  await expect(page.getByText("Musa Ibrahim")).toBeVisible();
  await expect(page.getByText("Ada Nwosu")).toBeVisible();

  await page
    .locator("article")
    .filter({ hasText: "Ada Nwosu" })
    .getByRole("link", { name: "Open records" })
    .click();
  await expect(page).toHaveURL(/\/workspace\/patients\/00000000-0000-4000-8000-000000000024$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ada Nwosu");
  await expect(page.getByText("HSP-99211 · Unity Medical")).toBeVisible();
});

test("activates a bounded emergency summary and requests one explicit domain", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Explore with a sample account").click();
  await page.getByRole("button", { name: "Amina Yusuf" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Open records for Musa Ibrahim" }).click();
  await page.getByRole("link", { name: "Open emergency summary" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Open an emergency patient summary",
  );
  await page.getByLabel("Source facility").selectOption("00000000-0000-4000-8000-000000000002");
  await page.getByRole("checkbox", { name: /I confirm this is necessary now/ }).check();
  await page.getByRole("button", { name: "Activate emergency summary" }).click();

  await expect(page.getByRole("heading", { name: "Emergency patient summary" })).toBeVisible();
  await expect(page.getByText(/Penicillin — Rash; moderate; active/)).toBeVisible();
  await page.getByRole("button", { name: "Choose additional records" }).click();
  await page.getByRole("checkbox", { name: "Allergies" }).check();
  await page
    .getByLabel("Why is this needed for immediate treatment?")
    .fill("Confirm the recorded allergy before selecting an immediate medication.");
  await page.getByRole("button", { name: "Request additional access" }).click();
  await expect(page.getByText("Additional emergency records")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await page.getByRole("button", { name: "Write review" }).first().click();
  await page
    .getByRole("textbox", { name: "Reason emergency access was needed" })
    .fill("The recorded allergy was necessary to choose safe immediate medication.");
  await page.getByRole("button", { name: "Submit clinical review" }).click();
  await expect(page.getByText("Your clinical review has been recorded.")).toBeVisible();
});

test("completes a patient-approved source exchange", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Explore with a sample account").click();
  await page.getByRole("button", { name: "Amina Yusuf" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Open records for Musa Ibrahim" }).click();
  await page.getByRole("link", { name: "Request records" }).click();

  await page.getByRole("button", { name: "Select Mercy General" }).click();
  await page.getByRole("checkbox", { name: "Allergies" }).click();
  await page
    .getByRole("textbox", { name: "Reason for this request" })
    .fill("Review source allergies before confirming the current treatment plan.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("button", { name: "Cancel request" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByText("Explore with a sample account").click();
  await page.getByRole("button", { name: "Musa Ibrahim" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Review who can access/);
  const notification = page
    .getByRole("list", { name: "Notifications", exact: true })
    .getByRole("listitem")
    .first();
  await notification.getByRole("button", { name: "Mark as read" }).click();
  await expect(notification.getByText("Read", { exact: true })).toBeVisible();
  const pendingRequest = page
    .locator("form")
    .filter({ hasText: "Review source allergies" })
    .first();
  await pendingRequest.getByRole("checkbox", { name: "Allergies" }).click();
  await pendingRequest.getByRole("button", { name: "Approve selected access" }).click();
  await expect(page.getByText(/Dr Amina Yusuf · Mercy General/).first()).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByText("Explore with a sample account").click();
  await page.getByRole("button", { name: "Amina Yusuf" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Open records for Musa Ibrahim" }).click();
  await page.getByRole("link", { name: "Request records" }).click();
  await expect(page.getByText(/Penicillin/)).toBeVisible();
  await expect(page.getByText("Read only")).toBeVisible();
});

test("logout clears the care team account", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Explore with a sample account").click();
  await page.getByRole("button", { name: "John Mensah" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/workspace$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("security administrator reviews stream evidence", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Explore with a sample account").click();
  await page.getByRole("button", { name: "Sarah Bello" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Security", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Security evidence");
  await expect(page.getByText("EMERGENCY ACTIVATED")).toBeVisible();
  await page.getByRole("button", { name: "Verify chain" }).click();
  await expect(page.getByText("VALID")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Administration" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Administration");
  await expect(page.getByText("Emergency policy", { exact: true })).toBeVisible();
});

test("security administrator can open downtime resilience controls", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Explore with a sample account").click();
  await page.getByRole("button", { name: "Sarah Bello" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Downtime", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Downtime recovery");
  await expect(page.getByText("Dependency readiness")).toBeVisible();
  await expect(page.getByText("Reconcile a paper form", { exact: true })).toBeVisible();
});

test("design system is development-only", async ({ page }) => {
  const response = await page.goto("/design-system");

  if (response?.status() === 404) {
    expect(response?.status()).toBe(404);
    return;
  }

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Small parts. Clear states.");
  await expect(page.getByText(/Representative examples only; contract-backed/)).toBeVisible();
});

test("restricted disclosure requires a necessity narrative", async ({ page }) => {
  const response = await page.goto("/design-system");

  if (response?.status() === 404) {
    expect(response?.status()).toBe(404);
    return;
  }

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

test("mobile navigation opens patients and access requests without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByText("Explore with a sample account").click();
  await page.getByRole("button", { name: "Amina Yusuf" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  const navigation = page.getByRole("navigation", {
    name: "Mobile navigation",
    exact: true,
  });
  await navigation.getByRole("link", { name: "Patients", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My patients" })).toBeVisible();
  await page.getByRole("textbox", { name: "Search patients" }).fill("Ada");
  await expect(page.getByText("Ada Nwosu")).toBeVisible();
  await expect(page.getByText("Musa Ibrahim")).not.toBeVisible();
  await navigation.getByRole("link", { name: "Access requests", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Access requests" })).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Access requests", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("record sharing offers the second patient’s own visit", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Explore with a sample account").click();
  await page.getByRole("button", { name: "Amina Yusuf" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Open records for Ada Nwosu" }).click();
  await page.getByRole("link", { name: "Request records" }).click();
  await expect(page.getByLabel("Current visit")).toHaveValue(
    "00000000-0000-4000-8000-000000000026",
  );
  await page.getByRole("button", { name: "Select Mercy General" }).click();
  await page.getByRole("checkbox", { name: "Allergies" }).check();
  await page
    .getByRole("textbox", { name: "Reason for this request" })
    .fill("Review Ada’s allergy records before confirming the treatment plan.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("button", { name: "Cancel request" }).first()).toBeVisible();
});

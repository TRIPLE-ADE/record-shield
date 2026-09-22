import { expect, test } from "@playwright/test";

for (const username of ["amina.unity", "musa.patient", "sarah.unity"]) {
  test(`live sign-in and authorized reads: ${username}`, async ({ page }) => {
    const failures: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/v1/") && response.status() >= 500)
        failures.push(`${new URL(response.url()).pathname}: ${response.status()}`);
    });
    await page.goto("/login");
    await expect(page.getByText("Explore with a sample account")).toHaveCount(0);
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill("synthetic-example-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(username === "musa.patient" ? /\/portal$/ : /\/workspace$/);
    if (username === "amina.unity") {
      await page.getByRole("link", { name: "Patients", exact: true }).click();
      await expect(page.getByText("Musa Ibrahim")).toBeVisible();
      await expect(page.getByText("Ada Nwosu")).toHaveCount(0);
      await page
        .getByRole("link", { name: "Open records for Musa Ibrahim", exact: true })
        .first()
        .click();
      await expect(
        page.getByText(/does not provide current visits|Visit selection|open visits/i).first(),
      ).toBeVisible();
    }
    if (username === "sarah.unity") {
      const events = page.waitForResponse((response) =>
        response.url().includes("/api/v1/security/events"),
      );
      const alerts = page.waitForResponse((response) =>
        response.url().includes("/api/v1/security/alerts"),
      );
      await page.goto("/workspace/security");
      expect((await events).status()).toBe(200);
      expect((await alerts).status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    await expect(page.getByText(/unexpected response|response could not be verified/i)).toHaveCount(
      0,
    );
    expect(failures).toEqual([]);
    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
}

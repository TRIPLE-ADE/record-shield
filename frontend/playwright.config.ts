import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/live-smoke.spec.ts",
  // The development API uses one in-memory mock service, so concurrent browser
  // workers would share consent state and make otherwise independent journeys race.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: { baseURL: "http://127.0.0.1:3101", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "./node_modules/.bin/next build --webpack && ./node_modules/.bin/next start --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_API_URL: "", RECORDSHIELD_BACKEND_URL: "" },
    timeout: 180_000,
  },
});

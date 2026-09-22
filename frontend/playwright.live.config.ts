import { defineConfig, devices } from "@playwright/test";

// Opt-in read-only smoke checks against an already running live-configured frontend.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/live-smoke.spec.ts",
  workers: 1,
  outputDir: "test-results-live",
  expect: { timeout: 20_000 },
  retries: 0,
  timeout: 60_000,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3000", trace: "off", screenshot: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

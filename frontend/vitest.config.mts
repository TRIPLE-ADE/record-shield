import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  optimizeDeps: {
    include: [
      "class-variance-authority",
      "cn",
      "@phosphor-icons/react",
      "next-themes",
      "next/link",
      "radix-ui",
      "react-hook-form",
      "@hookform/resolvers/zod",
      "zod",
    ],
  },
  define: { "process.env": JSON.stringify({ NODE_ENV: "test" }) },
  test: {
    api: { host: "127.0.0.1", port: 63315 },
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    coverage: {
      provider: "v8",
      include: ["features/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    },
  },
});

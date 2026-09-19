import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    browserName: "chromium",
    extraHTTPHeaders: { "Cf-Access-Authenticated-User-Email": "admin@vkb.test" },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/start-e2e.mjs",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop-chromium",
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
});

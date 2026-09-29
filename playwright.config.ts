import { defineConfig, devices } from "@playwright/test";

// UI feedback loop (§0.15): pages at 375px, screenshots in test-results/.
// Expects the dev server to already be running (pnpm dev) so it uses your
// .env.local and the same process you're testing by hand.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  use: {
    baseURL: "http://127.0.0.1:3000",
    screenshot: "on",
  },
  projects: [
    {
      name: "mobile-375",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

// Runs the production build against a mocked API (see e2e/mock-api.ts), so the
// tests need neither the backend nor F1 timing data.
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { NEXT_PUBLIC_API_URL: "http://mock.local/api" },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Specs share one seeded Postgres database — run them serially.
  fullyParallel: false,
  workers: 1,
  // Auto-retry transient UI-timing flakes on shared CI runners (peek latency,
  // key-press/focus races). Local runs don't retry so flakes surface.
  retries: process.env.CI ? 2 : 0,
  globalSetup: './e2e/helpers.ts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    // Authenticate once after the DB seed; saves cookies to e2e/.auth/admin.json.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @productmap/api dev',
      url: 'http://localhost:3411/api/healthz',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @productmap/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});

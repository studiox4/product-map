import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Specs share one seeded Postgres database — run them serially.
  fullyParallel: false,
  workers: 1,
  globalSetup: './e2e/helpers.ts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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

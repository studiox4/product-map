import { test, expect } from '@playwright/test';

// Logged-out marketing landing. The chromium project applies a global
// storageState (e2e/.auth/admin.json) that logs the test user in; override it
// with an empty storage state so `/` is visited as an anonymous visitor and
// /api/auth/me returns 401 (MarketingNav stays on "Sign in").
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('marketing landing', () => {
  test('logged-out / shows the hero and the Deploy CTA', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /self-hosted\. yours/i }),
    ).toBeVisible();
    const deploy = page.getByRole('link', { name: /deploy your own/i });
    await expect(deploy).toBeVisible();
    await expect(deploy).toHaveAttribute('href', 'https://github.com/studiox4/product-map');
  });

  test('clicking "Sign in" navigates to /login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /^sign in$/i }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

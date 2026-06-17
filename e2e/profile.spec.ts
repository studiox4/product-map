import { test, expect } from '@playwright/test';

// Feature hub AC1 (auth edition) — the logged-in user (admin "Corban") creates
// a feature and their name appears as the attributed creator in the board detail
// and on the full feature page. No WelcomeDialog exists under authenticated flows.

test.describe.configure({ mode: 'serial' });

test('AC1: feature creation is attributed to the logged-in user', async ({ page }) => {
  // Start from the board and create a new feature as the seeded admin.
  await page.goto('/app/board');
  const later = page.getByTestId('column-later');
  await later.getByRole('button', { name: 'Add feature' }).click();
  await page.getByLabel('Title').fill('Auth Attribution Feature');
  await page.getByRole('button', { name: 'Create' }).click();

  // Board peek panel shows "Added by Corban" (the seed admin's name).
  await later.getByRole('button', { name: 'Auth Attribution Feature', exact: true }).click();
  await expect(page.getByText(/Added by Corban/)).toBeVisible();

  // Full feature page shows activity + People section with attribution.
  await page.getByRole('button', { name: /Open feature/ }).click();
  await expect(page).toHaveURL(/\/app\/features\//);
  await expect(
    page
      .locator('section[aria-label="Activity"]')
      .getByText('Corban', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('section[aria-label="People"]').getByText('Creator')).toBeVisible();
});

test('AC1: landing page is accessible without a welcome dialog', async ({ page }) => {
  // Under auth there is no WelcomeDialog — the page loads directly.
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'ProductMap' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Welcome to ProductMap' })).toHaveCount(0);
});

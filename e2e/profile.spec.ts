import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

// Feature hub AC1 — fresh seed + cleared localStorage → welcome dialog once;
// the name persists and subsequent creations show "Added by <name>".

test.describe.configure({ mode: 'serial' });

const PSQL = '/Applications/Postgres.app/Contents/Versions/latest/bin/psql';
const DB_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/productmap';

test.beforeAll(() => {
  // First-run means no users at all: cascade-clears collaborators/activity and
  // nulls created_by/updated_by (FKs are set null / cascade).
  execFileSync(PSQL, [DB_URL, '-c', 'DELETE FROM users;'], { stdio: 'inherit' });
});

test('AC1: welcome dialog once, name persists, creations attributed', async ({ page }) => {
  // Fresh context ⇒ cleared localStorage; users table is empty.
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Welcome to ProductMap' });
  await expect(dialog).toBeVisible();

  // Name is required before getting started.
  await expect(dialog.getByRole('button', { name: 'Get started' })).toBeDisabled();
  await dialog.getByLabel('Your name').fill('Riley Tester');
  await dialog.getByRole('button', { name: 'Get started' }).click();
  await expect(dialog).toBeHidden();

  // Identity persisted to localStorage.pmUserId.
  const storedId = await page.evaluate(() => localStorage.getItem('pmUserId'));
  expect(storedId).toBeTruthy();

  // Only once: reload keeps the dialog closed.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'ProductMap' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Welcome to ProductMap' })).toBeHidden();

  // Subsequent feature creation is attributed to the new identity.
  await page.goto('/board');
  const later = page.getByTestId('column-later');
  await later.getByRole('button', { name: 'Add feature' }).click();
  await page.getByLabel('Title').fill('Riley Attribution Feature');
  await page.getByRole('button', { name: 'Create' }).click();

  await later.getByRole('button', { name: 'Riley Attribution Feature', exact: true }).click();
  await expect(page.getByText(/Added by Riley Tester/)).toBeVisible();

  // Full page shows the attributed creation activity too.
  await page.getByRole('button', { name: /Open feature/ }).click();
  await expect(page).toHaveURL(/\/features\//);
  await expect(
    page
      .locator('section[aria-label="Activity"]')
      .getByText('Riley Tester', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('section[aria-label="People"]').getByText('Creator')).toBeVisible();
});

test('AC1: a second visitor with users present adopts an identity silently', async ({ page }) => {
  // New browser context (no pmUserId) but users now exist → no dialog.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'ProductMap' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Welcome to ProductMap' })).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('pmUserId')))
    .toBeTruthy();
});

import path from 'node:path';
import fs from 'node:fs';
import { test as setup, expect } from '@playwright/test';

// Authenticate once and save the session to e2e/.auth/admin.json.
// The main test project reads this storageState so every spec starts logged in.

const AUTH_FILE = path.join(__dirname, '.auth/admin.json');

setup('authenticate as admin', async ({ page }) => {
  // Ensure the directory exists (gitignored; not committed).
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Email').fill('admin@productmap.local');
  await page.getByLabel('Password').fill('devpassword123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Successful login redirects to the landing page.
  await expect(page).toHaveURL('/', { timeout: 10_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'ProductMap' })).toBeVisible();

  // Persist the httpOnly auth cookies so all subsequent specs start authenticated.
  await page.context().storageState({ path: AUTH_FILE });
});

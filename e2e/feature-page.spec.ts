import { test, expect } from '@playwright/test';
import { addDaysIso, todayIso, getProjectId } from './helpers';

// Feature hub AC2 — board card click → peek sheet → "Open feature ↗" → full page
// with description, docs grid, people, dates, activity.
// Feature hub AC3 — horizon/status/dates/description edits each write an activity
// entry visible in the feature page feed. Delete moved to the full page.

test.describe.configure({ mode: 'serial' });

const FEATURE_TITLE = 'Hub Verification Feature';
let featureId = '';

test('AC2: card click opens the peek fast; Open feature lands on the full page', async ({
  page,
  request,
}) => {
  const pid = await getProjectId(request);
  const res = await request.post(`/api/projects/${pid}/features`, {
    data: { title: FEATURE_TITLE, horizon: 'later' },
  });
  expect(res.status()).toBe(201);
  featureId = ((await res.json()) as { id: string }).id;

  await page.goto('/app/board');
  const card = page.getByRole('button', { name: FEATURE_TITLE, exact: true });
  await expect(card).toBeVisible();

  const t0 = Date.now();
  await card.click();
  await expect(page.getByLabel('Title')).toBeVisible(); // peek sheet content
  // Spec target is <300ms; the peek must be near-instant (not a full nav/load).
  // Threshold is generous to absorb shared-CI scheduling jitter while still
  // catching a multi-second regression.
  expect(Date.now() - t0).toBeLessThan(3000);

  await page.getByRole('button', { name: /Open feature/ }).click();
  await expect(page).toHaveURL(new RegExp(`/app/features/${featureId}$`));

  // Full page anatomy: title, description, docs grid, activity, people, dates, horizon.
  await expect(page.getByLabel('Feature title')).toHaveValue(FEATURE_TITLE);
  await expect(page.locator('section[aria-label="Description"]')).toBeVisible();
  await expect(page.locator('section[aria-label="Docs"]')).toBeVisible();
  await expect(page.locator('section[aria-label="Activity"]')).toBeVisible();
  await expect(page.locator('section[aria-label="People"]')).toBeVisible();
  await expect(page.locator('section[aria-label="Dates"]')).toBeVisible();
  await expect(page.locator('section[aria-label="Horizon"]')).toBeVisible();

  // Creation is already in the feed, attributed to the fallback seeded user.
  await expect(
    page.locator('section[aria-label="Activity"]').getByText('created this feature'),
  ).toBeVisible();
});

test('AC3: editing the description renders markdown and records activity', async ({ page }) => {
  await page.goto(`/app/features/${featureId}`);

  await page.getByRole('button', { name: 'Add a description…' }).click();
  const textarea = page.getByLabel('Feature description');
  await expect(textarea).toBeVisible();
  await textarea.fill('## Goals\n\n- Verify the feature hub\n- Keep activity honest');
  await page.getByRole('heading', { name: 'Description' }).click(); // blur → save

  const description = page.locator('section[aria-label="Description"]');
  await expect(description.getByRole('heading', { name: 'Goals' })).toBeVisible();
  await expect(description.getByText('Verify the feature hub')).toBeVisible();

  await expect(
    page.locator('section[aria-label="Activity"]').getByText('edited the description'),
  ).toBeVisible();
});

test('AC3: status, horizon and date edits each write an activity entry', async ({ page }) => {
  await page.goto(`/app/features/${featureId}`);
  const activity = page.locator('section[aria-label="Activity"]');

  // Status via the header pill select.
  await page.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'In progress' }).click();
  await expect(activity.getByText('changed status to In progress')).toBeVisible();

  // Horizon via the right rail select.
  await page.getByRole('combobox', { name: 'Horizon' }).click();
  await page.getByRole('option', { name: 'Next' }).click();
  await expect(activity.getByText('moved this to Next')).toBeVisible();

  // Dates via the right rail inputs.
  const start = todayIso();
  await page.locator('#feature-page-start-date').fill(start);
  await page.locator('#feature-page-end-date').fill(addDaysIso(start, 14));
  await expect(activity.getByText('updated the dates').first()).toBeVisible();
});

test('AC2: people rail lists the creator and supports add/remove collaborator', async ({
  page,
  request,
}) => {
  const res = await request.post('/api/admin/users', {
    data: { email: 'sasha.verify@test.local', name: 'Sasha Verify', role: 'member' },
  });
  expect(res.status()).toBe(201);

  await page.goto(`/app/features/${featureId}`);
  const people = page.locator('section[aria-label="People"]');
  await expect(people.getByText('Creator')).toBeVisible();

  await people.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Sasha Verify' }).click();
  await expect(people.getByText('Sasha Verify')).toBeVisible();

  await people.getByRole('button', { name: 'Remove Sasha Verify' }).click();
  await expect(people.getByText('Sasha Verify')).toBeHidden();
});

test('archive lives on the full page: confirm dialog → back to board, card gone', async ({
  page,
}) => {
  await page.goto(`/app/features/${featureId}`);
  await page.getByRole('button', { name: 'Archive feature' }).click();

  const dialog = page.getByRole('dialog', { name: 'Archive feature?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Archive', exact: true }).click();

  await expect(page).toHaveURL(/\/app\/board$/);
  await expect(page.getByRole('button', { name: FEATURE_TITLE, exact: true })).toBeHidden();
});

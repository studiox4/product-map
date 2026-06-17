import { test, expect } from '@playwright/test';

// AC2 — Landing: editable vision header; compact Gantt hero with ≥6 horizon-colored
// bars + today line; Now/Next/Later panels (top 3 + "+N more"); Attention panel with
// ≥1 draft doc and ≥1 dateless feature, each navigating on click.

test.describe('AC2 landing dashboard', () => {
  test('vision header is editable inline', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1, name: 'ProductMap' })).toBeVisible();

    const visionButton = page.getByTitle('Click to edit the vision');
    await expect(visionButton).toBeVisible();
    await visionButton.click();

    const input = page.getByLabel('Product vision');
    await expect(input).toBeVisible();
    await input.fill('Roadmaps and docs your security team will let you run. Really.');
    await input.press('Enter');

    await expect(page.getByText('Vision saved')).toBeVisible();
    await expect(
      page.getByTitle('Click to edit the vision'),
    ).toContainText('Really.');
  });

  test('gantt hero renders ≥6 seeded bars with a today line', async ({ page }) => {
    await page.goto('/app');
    const bars = page.getByTestId('gantt-hero-bar');
    await expect(bars.first()).toBeVisible();
    expect(await bars.count()).toBeGreaterThanOrEqual(6);
    // A vertical SVG line has a zero-width bounding box, so assert attachment not visibility.
    await expect(page.getByTestId('gantt-hero-today')).toHaveCount(1);
  });

  test('hero bar click navigates to the roadmap', async ({ page }) => {
    await page.goto('/app');
    await page.getByTestId('gantt-hero-bar').first().click();
    await expect(page).toHaveURL(/\/app\/roadmap\?feature=/);
  });

  test('now/next/later panels list seeded features with +N more overflow', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByTestId('gantt-hero-bar').first()).toBeVisible();

    for (const label of ['Now', 'Next', 'Later']) {
      const panel = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: label, exact: true }) });
      await expect(panel).toBeVisible();
      // Each panel lists at least one seeded feature row (buttons inside the panel).
      expect(await panel.getByRole('button').count()).toBeGreaterThanOrEqual(1);
    }

    // Later has 4 seeded features → top 3 + overflow link.
    const later = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Later', exact: true }) });
    const more = later.getByRole('link', { name: /\+\d+ more/ });
    await expect(more).toBeVisible();
    await more.click();
    await expect(page).toHaveURL(/\/app\/board$/);
  });

  test('panel feature click opens the board detail panel', async ({ page }) => {
    await page.goto('/app');
    const now = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Now', exact: true }) });
    await now.getByRole('button').first().click();
    await expect(page).toHaveURL(/\/app\/board\?feature=/);
    await expect(page.getByLabel('Title')).toBeVisible(); // detail sheet open
  });

  test('attention panel lists a draft doc and a dateless feature, both navigable', async ({
    page,
  }) => {
    await page.goto('/app');
    const attention = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Needs attention' }) });
    await expect(attention).toBeVisible();

    // ≥1 draft doc → navigates to the editor.
    const draftItem = attention.getByRole('button').filter({ hasText: 'Draft doc' }).first();
    await expect(draftItem).toBeVisible();
    await draftItem.click();
    await expect(page).toHaveURL(/\/app\/docs\//);

    // ≥1 dateless feature → navigates to the board detail panel.
    await page.goto('/app');
    const datelessItem = attention.getByRole('button').filter({ hasText: 'No dates' }).first();
    await expect(datelessItem).toBeVisible();
    await datelessItem.click();
    await expect(page).toHaveURL(/\/app\/board\?feature=/);
  });
});

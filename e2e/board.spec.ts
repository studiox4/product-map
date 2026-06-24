import { test, expect, type Page } from '@playwright/test';
import { addDaysIso, getFeatureByTitle, todayIso } from './helpers';

// AC3 — create feature → card without reload → PRD from template → editor pre-filled →
// type + insert table & task list via slash menu → Saved → persists across reload.
// AC4 — drag Later→Now syncs board, landing Now panel, and roadmap bar color.

test.describe.configure({ mode: 'serial' });

const FEATURE_TITLE = 'Demo Feature X';

async function dragTo(page: Page, sourceSel: string, targetSel: string) {
  const source = page.locator(sourceSel);
  const target = page.locator(targetSel);
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('missing bounding box for drag');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
}

test('AC3: create feature in Later — card appears without reload', async ({ page }) => {
  await page.goto('/app/board');
  const later = page.getByTestId('column-later');
  await expect(later).toBeVisible();

  await later.getByRole('button', { name: 'Add feature' }).click();
  await page.getByLabel('Title').fill(FEATURE_TITLE);
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(later.getByText(FEATURE_TITLE)).toBeVisible();
});

test('AC3: PRD from template, slash-menu table + task list, saved + persists', async ({
  page,
}) => {
  await page.goto('/app/board');
  await page.getByRole('button', { name: FEATURE_TITLE }).click();

  // Detail sheet → new doc dialog, PRD preselected with prefilled title.
  await page.getByRole('button', { name: 'New doc' }).click();
  const dialog = page.getByRole('dialog', { name: 'New doc' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Title')).toHaveValue(`${FEATURE_TITLE} — PRD`);
  await dialog.getByRole('button', { name: 'Create' }).click();

  await page.waitForURL(/\/app\/docs\//);
  const body = page.locator('[aria-label="Document body"]');
  await expect(body).toBeVisible();

  // Editor pre-filled with the PRD skeleton.
  await expect(body.getByRole('heading', { name: `${FEATURE_TITLE} — PRD` })).toBeVisible();
  await expect(body.getByRole('heading', { name: 'Requirements' })).toBeVisible();
  await expect(body.getByRole('heading', { name: 'Problem & opportunity' })).toBeVisible();

  // Put the caret at the end of the first hint paragraph (deterministic across
  // platforms — Meta+ArrowDown is unreliable in headless Chromium).
  const firstParagraph = body.locator('p').first();
  await firstParagraph.click();
  await firstParagraph.evaluate((el) => {
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.press('Enter');
  await page.keyboard.type('Custom persistence check text');
  await page.keyboard.press('Enter');

  // Slash menu → task list. (The PRD template already contains task lists, so
  // scope assertions to the newly typed content.)
  await page.keyboard.type('/task');
  await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.type('First task item');
  await expect(
    body.locator('ul[data-type="taskList"]').filter({ hasText: 'First task item' }),
  ).toBeVisible();

  // Exit the task list, then slash menu → table. (The template already ships
  // tables, so assert one more table appears.)
  const tablesBefore = await body.locator('table').count();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/table');
  await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(body.locator('table')).toHaveCount(tablesBefore + 1);

  // Autosave indicator.
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Reload → everything persisted.
  await page.reload();
  await expect(body.getByText('Custom persistence check text')).toBeVisible();
  await expect(body.locator('table')).toHaveCount(tablesBefore + 1);
  await expect(
    body.locator('ul[data-type="taskList"]').filter({ hasText: 'First task item' }),
  ).toBeVisible();
});

test('AC4: drag Later→Now lands in Now and syncs the landing panel', async ({
  page,
  request,
}) => {
  await page.goto('/app/board');
  await expect(page.getByTestId('column-later').getByText(FEATURE_TITLE)).toBeVisible();

  await dragTo(page, `[aria-label="${FEATURE_TITLE}"]`, '[data-testid="column-now"]');

  await expect(page.getByTestId('column-now').getByText(FEATURE_TITLE)).toBeVisible();
  await expect
    .poll(async () => (await getFeatureByTitle(request, FEATURE_TITLE)).horizon)
    .toBe('now');

  // Overview Now panel includes it.
  await page.goto('/app/p/productmap');
  const nowPanel = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Now', exact: true }) });
  await expect(nowPanel.getByText(FEATURE_TITLE)).toBeVisible();
});

test('AC4: after scheduling, the roadmap bar is green (now horizon)', async ({
  page,
  request,
}) => {
  const start = todayIso();
  const end = addDaysIso(start, 14);

  await page.goto(
    `/app/board?feature=${(await getFeatureByTitle(request, FEATURE_TITLE)).id}`,
  );
  await page.locator('#feature-start-date').fill(start);
  await page.locator('#feature-end-date').fill(end);

  await expect
    .poll(async () => (await getFeatureByTitle(request, FEATURE_TITLE)).endDate)
    .toBe(end);

  const feature = await getFeatureByTitle(request, FEATURE_TITLE);
  await page.goto('/app/roadmap');
  const bar = page.getByTestId(`gantt-bar-${feature.id}`);
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('fill', '#16a34a'); // HORIZON_COLORS.now.bar
});

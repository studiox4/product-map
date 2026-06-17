import { test, expect, type Page } from '@playwright/test';
import { createDocument, getFeatureByTitle, getFeatures, getProjectId } from './helpers';

// AC-UX1 — every route shows skeletons while loading (throttled network).
// AC-UX2 — board drag: grab cursor, drop highlight, optimistic move.
// AC-UX3 — empty board column shows an empty state with an "Add feature" action.
// AC-UX6 — Esc closes the new-doc dialog; slash menu navigable by arrows + Enter.

test.describe.configure({ mode: 'serial' });

async function throttleApi(page: Page, ms = 700) {
  await page.route('**/api/**', async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

test('AC-UX1: landing, board and roadmap show skeletons while loading', async ({ page }) => {
  await throttleApi(page);
  for (const [path, testId] of [
    ['/app', 'landing-skeleton'],
    ['/app/board', 'board-skeleton'],
    ['/app/roadmap', 'roadmap-skeleton'],
  ] as const) {
    await page.goto(path, { waitUntil: 'commit' });
    await expect(page.getByTestId(testId)).toBeVisible();
    await expect(page.getByTestId(testId)).toBeHidden({ timeout: 15_000 });
  }
});

test('AC-UX1: doc editor shows a skeleton while loading', async ({ page, request }) => {
  const features = await getFeatures(request);
  const docId = features.flatMap((f) => f.documents)[0]?.id;
  expect(docId).toBeTruthy();

  await throttleApi(page);
  await page.goto(`/app/docs/${docId}`, { waitUntil: 'commit' });
  await expect(page.locator('.shimmer').first()).toBeVisible();
  await expect(page.locator('[aria-label="Document body"]')).toBeVisible({ timeout: 15_000 });
});

test('AC-UX2: drag shows grab cursor, drop highlight, and moves optimistically', async ({
  page,
}) => {
  await page.goto('/app/board');
  const card = page.getByRole('button', { name: 'Now-next-later board', exact: true });
  await expect(card).toBeVisible();

  // Grab cursor affordance.
  const cursor = await card.evaluate((el) => getComputedStyle(el).cursor);
  expect(cursor).toBe('grab');

  const from = (await card.boundingBox())!;
  const target = page.getByTestId('column-next');
  const to = (await target.boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Any on-screen point inside the column works: the column highlights when a
  // drag hovers it or any card in it. Clamp to the viewport — tall boards push
  // the column bottom off-screen, which would trigger dnd-kit auto-scroll and
  // stale droppable geometry.
  const viewport = page.viewportSize()!;
  await page.mouse.move(
    to.x + to.width / 2,
    Math.min(to.y + to.height - 24, viewport.height - 60),
    { steps: 12 },
  );

  // While dragging: source dims, drop target highlights.
  await expect(card).toHaveClass(/opacity-50/);
  await expect(target).toHaveClass(/ring-2/);

  await page.mouse.up();

  // Optimistic: the card is in the Next column immediately (no reload, short timeout).
  await expect(target.getByText('Now-next-later board')).toBeVisible({ timeout: 1_000 });
});

test('AC-UX3: an empty column shows an empty state with an Add feature action', async ({
  page,
  request,
}) => {
  // Empty the Now column via the API.
  const pid = await getProjectId(request);
  const nowFeatures = (await getFeatures(request)).filter((f) => f.horizon === 'now');
  for (const f of nowFeatures) {
    const res = await request.delete(`/api/projects/${pid}/features/${f.id}`);
    expect(res.status()).toBe(204);
  }

  await page.goto('/app/board');
  const nowColumn = page.getByTestId('column-now');
  await expect(nowColumn.getByText('Nothing here yet')).toBeVisible();
  await expect(nowColumn.getByRole('button', { name: 'Add feature' })).toBeVisible();
});

test('AC-UX6: Esc closes the new-doc dialog and returns focus', async ({ page, request }) => {
  const feature = await getFeatureByTitle(request, 'ECS deployment');
  await page.goto(`/app/board?feature=${feature.id}`);

  const newDocButton = page.getByRole('button', { name: 'New doc' });
  await newDocButton.click();
  const dialog = page.getByRole('dialog', { name: 'New doc' });
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(newDocButton).toBeFocused();
});

test('AC-UX6: slash menu filters and is navigable with arrows + Enter, Esc closes', async ({
  page,
  request,
}) => {
  const feature = await getFeatureByTitle(request, 'ECS deployment');
  const doc = await createDocument(request, {
    featureId: feature.id,
    type: 'feature_brief',
    title: 'Slash menu e2e doc',
    fromTemplate: false,
  });

  await page.goto(`/app/docs/${doc.id}`);
  const body = page.locator('[aria-label="Document body"]');
  await body.click();

  // Filters as you type.
  await page.keyboard.type('/head');
  const listbox = page.getByRole('listbox', { name: 'Insert block' });
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('option')).toHaveCount(3); // Heading 1/2/3

  // ArrowDown + Enter inserts the second item (Heading 2).
  await page.keyboard.press('ArrowDown');
  await expect(listbox.getByRole('option', { name: /Heading 2/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  await expect(listbox).toBeHidden();
  await expect(body.locator('h2')).toHaveCount(1);

  // Esc closes the menu without inserting.
  await page.keyboard.type('text then /tab');
  await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeHidden();
});

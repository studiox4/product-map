import { test, expect, type Page } from '@playwright/test';
import { getFeatureByTitle, getProjectId } from './helpers';

// Feature hub AC4 — /docs lists every doc with correct type/status colors;
// type + status filters AND search compose; sort by updated works.
// Feature hub AC5 — row click → read-only markdown preview pane; "Open in editor"
// lands in the full editor.
// Feature hub AC6 — doc type/status chip colors identical across board, docs
// table, feature page and editor toolbar (single shared source).

test.describe.configure({ mode: 'serial' });

const PRD_TITLE = 'Rich markdown editor — PRD';
const TECH_SPEC_TITLE = 'Rich markdown editor — Tech spec';
const BRIEF_TITLE = 'Gantt roadmap — Feature brief';

// From @productmap/shared DOC_TYPE_COLORS / DOC_STATUS_COLORS.
const PRD_CHIP_BG = 'rgb(220, 235, 255)'; // #dcebff
const TECH_SPEC_CHIP_BG = 'rgb(239, 227, 251)'; // #efe3fb
const BRIEF_CHIP_BG = 'rgb(228, 240, 228)'; // #e4f0e4
const DRAFT_CHIP_BG = 'rgb(237, 241, 247)'; // var(--pm-wash) light value #edf1f7 (theme sweep)

async function chipBg(page: Page, scope: ReturnType<Page['locator']>, label: string) {
  return scope
    .getByText(label, { exact: true })
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
}

function row(page: Page, title: string) {
  return page.getByRole('row').filter({ hasText: title });
}

test('AC4: /docs lists seeded docs with spec chip colors', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Docs' }).click();
  await expect(page).toHaveURL(/\/docs$/);

  for (const title of [PRD_TITLE, TECH_SPEC_TITLE, BRIEF_TITLE]) {
    await expect(row(page, title)).toBeVisible();
  }

  expect(await chipBg(page, row(page, PRD_TITLE), 'PRD')).toBe(PRD_CHIP_BG);
  expect(await chipBg(page, row(page, TECH_SPEC_TITLE), 'Tech spec')).toBe(TECH_SPEC_CHIP_BG);
  expect(await chipBg(page, row(page, BRIEF_TITLE), 'Feature brief')).toBe(BRIEF_CHIP_BG);
  expect(await chipBg(page, row(page, PRD_TITLE), 'Draft')).toBe(DRAFT_CHIP_BG);
});

test('AC4: type + status filters AND search compose', async ({ page }) => {
  await page.goto('/docs');
  await expect(row(page, PRD_TITLE)).toBeVisible();

  // Type filter: PRD only.
  const typeGroup = page.getByRole('group', { name: 'Filter by type' });
  await typeGroup.getByRole('button', { name: 'PRD' }).click();
  await expect(typeGroup.getByRole('button', { name: 'PRD' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(row(page, PRD_TITLE)).toBeVisible();
  await expect(row(page, TECH_SPEC_TITLE)).toBeHidden();
  await expect(row(page, BRIEF_TITLE)).toBeHidden();

  // + status filter (seeded PRD is draft) → still visible.
  const statusGroup = page.getByRole('group', { name: 'Filter by status' });
  await statusGroup.getByRole('button', { name: 'Draft' }).click();
  await expect(row(page, PRD_TITLE)).toBeVisible();

  // + search narrows further, composed with both filters.
  const search = page.getByLabel('Search docs');
  await search.fill('Rich markdown');
  await expect(row(page, PRD_TITLE)).toBeVisible();
  await search.fill('zzz-no-such-doc');
  await expect(page.getByText('No docs match.')).toBeVisible();

  // Search matches feature title too (composes with PRD+Draft filters).
  await search.fill('rich markdown editor');
  await expect(row(page, PRD_TITLE)).toBeVisible();
  await expect(row(page, TECH_SPEC_TITLE)).toBeHidden(); // still type-filtered out
});

test('AC4: sort by updated toggles asc/desc and reorders rows', async ({ page, request }) => {
  const pid = await getProjectId(request);
  const res = await request.get(`/api/projects/${pid}/documents?all=true`);
  expect(res.ok()).toBeTruthy();
  const docs = (await res.json()) as { title: string; updatedAt: string }[];
  const byUpdatedAsc = [...docs].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const byUpdatedDesc = [...byUpdatedAsc].reverse();

  await page.goto('/docs');
  const firstTitleCell = page.locator('tbody tr').first().locator('td').first();

  // Default: updated desc.
  await expect(firstTitleCell).toHaveText(byUpdatedDesc[0].title);

  // Toggle → asc (oldest first).
  await page.getByRole('button', { name: 'Updated' }).click();
  await expect(firstTitleCell).toHaveText(byUpdatedAsc[0].title);

  // Title sort: alphabetical asc.
  await page.getByRole('button', { name: 'Title' }).click();
  const byTitleAsc = [...docs].sort((a, b) => a.title.localeCompare(b.title));
  await expect(firstTitleCell).toHaveText(byTitleAsc[0].title);
});

test('AC5: row click opens a read-only preview; Open in editor → full editor', async ({
  page,
}) => {
  await page.goto('/docs');
  await row(page, PRD_TITLE).first().click();

  const sheet = page.getByRole('dialog');
  // Sheet title (h2) plus the rendered markdown h1 — both present.
  await expect(sheet.getByRole('heading', { level: 2, name: PRD_TITLE })).toBeVisible();
  await expect(sheet.getByRole('heading', { level: 1, name: PRD_TITLE })).toBeVisible();
  // Rendered markdown with prose styles, read-only (no contenteditable).
  await expect(sheet.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Requirements' })).toBeVisible();
  expect(await sheet.locator('[contenteditable="true"]').count()).toBe(0);

  await sheet.getByRole('link', { name: /Open in editor/ }).click();
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]{36}$/);
  await expect(page.locator('[aria-label="Document body"]')).toBeVisible();
  await expect(
    page.locator('[aria-label="Document body"]').getByRole('heading', { name: PRD_TITLE }),
  ).toBeVisible();
});

test('AC6: PRD chip color identical on board, docs table, feature page and editor', async ({
  page,
  request,
}) => {
  const feature = await getFeatureByTitle(request, 'Rich markdown editor');
  const prdDoc = feature.documents.find((d) => d.type === 'prd');
  expect(prdDoc).toBeTruthy();

  const seen: Record<string, string> = {};

  await page.goto('/docs');
  seen.docsTable = await chipBg(page, row(page, PRD_TITLE), 'PRD');

  await page.goto('/board');
  const card = page.getByRole('button', { name: /Rich markdown editor/ });
  await expect(card).toBeVisible();
  seen.boardCard = await chipBg(page, card, 'PRD');

  await page.goto(`/features/${feature.id}`);
  const docsGrid = page.locator('section[aria-label="Docs"]');
  await expect(docsGrid).toBeVisible();
  seen.featurePage = await chipBg(page, docsGrid, 'PRD');

  await page.goto(`/docs/${prdDoc!.id}`);
  await expect(page.locator('[aria-label="Document body"]')).toBeVisible();
  seen.editorToolbar = await chipBg(page, page.locator('body'), 'PRD');

  for (const [surface, bg] of Object.entries(seen)) {
    expect(bg, `${surface} PRD chip background`).toBe(PRD_CHIP_BG);
  }
});

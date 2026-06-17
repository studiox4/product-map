import { test, expect, type Page } from '@playwright/test';
import { createDocument, getFeatureByTitle, getProjectId, resetDb } from './helpers';

// Signature set Wave 2 (docs/superpowers/specs/2026-06-10-signature-set-design.md)
// W2-1 — Roadmap Time Machine: History toggle, scrub to earliest shows ≥3
//        differences vs now (seeded 3-month history), Play sweeps ~4s,
//        Back to now restores the live state.
// W2-2 — Landing viz: sparkline path + heatmap cells render from real data;
//        AI digest streams when enabled and is absent without a key.
// W2-3 — Editor soul: callout + toggle insert via slash, serialize into
//        export.md, persist across reload (md→Tiptap parse is unit-tested in
//        apps/api/src/lib/markdown.test.ts); ToC rail on the seeded PRD;
//        reader view renders with the cover the picker set.

test.describe.configure({ mode: 'serial' });

// profile.spec.ts (alphabetically earlier) runs `DELETE FROM users`, which
// cascade-deletes the seeded 3-month activity history the Time Machine and
// landing viz replay. Start this spec from a fresh seed.
test.beforeAll(() => {
  resetDb();
});

const EDITOR_FEATURE = 'Rich markdown editor';

interface BarState {
  id: string;
  x: string;
  width: string;
  fill: string;
}

/** Geometry + fill of every Gantt bar, keyed by feature id. */
async function ganttBarStates(page: Page): Promise<BarState[]> {
  return page.$$eval('[data-testid^="gantt-bar-"]', (rects) =>
    rects.map((r) => ({
      id: r.getAttribute('data-testid')!.replace('gantt-bar-', ''),
      x: r.getAttribute('x') ?? '',
      width: r.getAttribute('width') ?? '',
      fill: r.getAttribute('fill') ?? '',
    })),
  );
}

/** Count visible differences between two roadmap states (missing bar, moved/resized bar, horizon recolor). */
function diffCount(now: BarState[], past: BarState[]): number {
  const pastById = new Map(past.map((b) => [b.id, b]));
  let diffs = 0;
  for (const bar of now) {
    const old = pastById.get(bar.id);
    if (!old) {
      diffs += 1; // feature didn't exist yet (feature_created undone)
      continue;
    }
    if (old.x !== bar.x || old.width !== bar.width) diffs += 1; // dates_changed undone
    if (old.fill !== bar.fill) diffs += 1; // horizon flip undone
  }
  return diffs;
}

/** Move the native range slider with React-visible input/change events. */
async function scrubTo(page: Page, value: 'min' | 'max') {
  await page.locator('[data-testid="time-machine-slider"]').evaluate((el, target) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, target === 'min' ? input.min : input.max);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('W2-1: Time Machine scrubs to the earliest event with ≥3 visible changes, plays, and restores', async ({
  page,
}) => {
  await page.goto('/roadmap');
  await expect(page.locator('[data-testid^="gantt-bar-"]').first()).toBeVisible();
  const nowState = await ganttBarStates(page);
  expect(nowState.length).toBeGreaterThan(0);

  // History pill toggles Time Machine mode; the tray swaps for the scrub bar.
  const historyToggle = page.locator('[data-testid="history-toggle"]');
  await historyToggle.click();
  await expect(historyToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid="time-machine"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unscheduled' })).toBeHidden();

  // Scrub to the earliest seeded event → the replayed past must differ from
  // now in ≥3 visible ways (bars move, horizons flip, features disappear).
  await scrubTo(page, 'min');
  await expect
    .poll(async () => diffCount(nowState, await ganttBarStates(page)), { timeout: 5_000 })
    .toBeGreaterThanOrEqual(3);

  // Date chip rides the thumb at the earliest point of the timeline.
  await expect(page.locator('[data-testid="time-machine-chip"]')).toHaveText(/^[A-Z][a-z]{2} \d{1,2}$/);

  // Read-only while scrubbing: the Gantt wrapper is pointer-inert.
  await expect(page.locator('div[aria-disabled="true"].pointer-events-none')).toHaveCount(1);
  await expect(page.getByText(/read-only until you come back to now/i)).toBeVisible();

  // Play ▸ sweeps the full range in ~4s and parks at now.
  await page.getByRole('button', { name: /play history/i }).click();
  const slider = page.locator('[data-testid="time-machine-slider"]');
  await expect
    .poll(
      async () =>
        slider.evaluate((el) => {
          const input = el as HTMLInputElement;
          return Number(input.max) - Number(input.value) <= Number(input.step);
        }),
      { timeout: 6_000 },
    )
    .toBe(true);

  // Sweep done → the roadmap is back to its live geometry.
  await expect.poll(async () => diffCount(nowState, await ganttBarStates(page))).toBe(0);

  // Back to now exits history mode and re-enables editing.
  await page.getByRole('button', { name: 'Back to now' }).click();
  await expect(page.locator('[data-testid="time-machine"]')).toBeHidden();
  await expect(historyToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: 'Unscheduled' })).toBeVisible();
  expect(diffCount(nowState, await ganttBarStates(page))).toBe(0);
});

test('W2-2: landing renders sparkline, horizon arc, and heatmap from seeded activity', async ({
  page,
}) => {
  await page.goto('/');

  // Velocity sparkline: a real SVG path drawn in the action color.
  const sparkline = page.locator('[data-testid="velocity-sparkline"]');
  await expect(sparkline).toBeVisible();
  const d = await sparkline.locator('path').last().getAttribute('d');
  expect(d).toMatch(/^M.+L.+/); // multi-point path, not a stub

  // Horizon arc donut.
  await expect(page.locator('[data-testid="horizon-arc"]')).toBeVisible();

  // Pulse heatmap: a 12-week grid with at least one active day from the
  // seeded 3-month history.
  const heatmap = page.locator('[data-testid="pulse-heatmap"]');
  await expect(heatmap).toBeVisible();
  const days = heatmap.locator('[data-testid="pulse-day"]');
  expect(await days.count()).toBeGreaterThanOrEqual(7 * 8);
  expect(
    await days.evaluateAll((els) => els.filter((el) => el.getAttribute('data-level') !== '0').length),
  ).toBeGreaterThan(0);
});

test('W2-2: AI digest streams when enabled and is hidden without a key', async ({ page }) => {
  // Without a key → no digest card at all.
  await page.route('**/api/ai/status', (route) => route.fulfill({ json: { enabled: false } }));
  await page.goto('/');
  await expect(page.locator('[data-testid="pulse-heatmap"]')).toBeVisible();
  await expect(page.locator('[data-testid="ai-digest-card"]')).toHaveCount(0);

  // With a key → the digest streams over SSE into the card.
  await page.route('**/api/ai/status', (route) => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/ai/digest', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'event: chunk\ndata: {"text":"## This week\\n\\nShipped the "}\n\n',
        'event: chunk\ndata: {"text":"**Time Machine** and the landing pulse."}\n\n',
        'event: done\ndata: {}\n\n',
      ].join(''),
    }),
  );
  await page.reload();
  const card = page.locator('[data-testid="ai-digest-card"]');
  await expect(card).toBeVisible();
  await expect(card.getByText('This week in ProductMap')).toBeVisible();
  await expect(card.getByText(/Time Machine/)).toBeVisible();
});

test('W2-3: callout + toggle insert via slash, hit export.md, and persist across reload', async ({
  page,
  request,
}) => {
  const feature = await getFeatureByTitle(request, EDITOR_FEATURE);
  const doc = await createDocument(request, {
    featureId: feature.id,
    type: 'tech_spec',
    title: 'Signature W2 blocks doc',
    fromTemplate: false,
  });

  await page.goto(`/docs/${doc.id}`);
  const body = page.locator('[aria-label="Document body"]');
  await expect(body).toBeVisible();
  await body.click();

  // /callout → tinted card with the 💡 default emoji; type its body.
  await page.keyboard.type('/callout');
  await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
  await page.keyboard.press('Enter');
  const callout = body.locator('[data-type="callout"]');
  await expect(callout).toBeVisible();
  await page.keyboard.type('Ship the demo on Friday');
  await expect(callout).toContainText('Ship the demo on Friday');

  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 });

  // /toggle in a second block: place the caret after the callout first.
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/toggle');
  await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
  await page.keyboard.press('Enter');
  const toggle = body.locator('[data-type="toggle"]');
  await expect(toggle).toBeVisible();
  await page.keyboard.type('Rollout plan'); // caret lands in the summary
  await expect(toggle.locator('summary')).toHaveText('Rollout plan');

  // export.md carries both serialized forms (emoji blockquote + details HTML).
  // Poll: the "Saved" pill from the callout save may still be on screen while
  // the toggle autosave debounce is in flight.
  const pid = await getProjectId(request);
  await expect
    .poll(async () => (await request.get(`/api/projects/${pid}/documents/${doc.id}/export.md`)).text(), {
      timeout: 10_000,
    })
    .toContain('<summary>Rollout plan</summary>');
  const exported = await (await request.get(`/api/projects/${pid}/documents/${doc.id}/export.md`)).text();
  expect(exported).toContain('> 💡 Ship the demo on Friday');
  expect(exported).toContain('<details');

  // Round-trip: the stored Tiptap JSON keeps first-class callout/toggle nodes
  // (md → Tiptap reimport of these forms is unit-tested in markdown.test.ts),
  // and a fresh load renders both blocks.
  const full = (await (await request.get(`/api/projects/${pid}/documents/${doc.id}`)).json()) as {
    contentJson: unknown;
  };
  const types: string[] = [];
  (function collect(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: string; content?: unknown[] };
    if (n.type) types.push(n.type);
    (n.content ?? []).forEach(collect);
  })(full.contentJson);
  expect(types).toContain('callout');
  expect(types).toContain('toggle');

  await page.reload();
  await expect(body.locator('[data-type="callout"]')).toContainText('Ship the demo on Friday');
  await expect(body.locator('[data-type="toggle"] summary')).toHaveText('Rollout plan');

  // Keep the seeded workspace pristine for later specs.
  expect((await request.delete(`/api/projects/${pid}/documents/${doc.id}`)).ok()).toBe(true);
});

test('W2-3: ToC rail appears on the seeded PRD and highlights the active section', async ({
  page,
  request,
}) => {
  const feature = await getFeatureByTitle(request, EDITOR_FEATURE);
  const prd = feature.documents.find((d) => d.type === 'prd');
  expect(prd).toBeTruthy();

  // Rail is xl-only; the short viewport gives the short seeded PRD enough
  // scroll travel for the active-section tracking to engage.
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto(`/docs/${prd!.id}`);

  const rail = page.getByRole('navigation', { name: 'Table of contents' });
  await expect(rail).toBeVisible();
  const entries = rail.getByRole('button');
  expect(await entries.count()).toBeGreaterThanOrEqual(3);

  // Click a mid-document entry → smooth-scrolls the heading to the top and it
  // becomes the active section. (The last heading can sit too close to the
  // document end to ever cross the tracking line, so use the second entry.)
  await entries.nth(1).click();
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBeGreaterThan(0);
  await expect(entries.nth(1)).toHaveAttribute('aria-current', 'true');
});

test('W2-3: cover picker sets a gradient and the reader view renders it chrome-free', async ({
  page,
  request,
}) => {
  const feature = await getFeatureByTitle(request, EDITOR_FEATURE);
  const doc = await createDocument(request, {
    featureId: feature.id,
    type: 'feature_brief',
    title: 'Signature W2 reader doc',
    fromTemplate: false,
  });

  await page.goto(`/docs/${doc.id}`);
  await expect(page.locator('[aria-label="Document body"]')).toBeVisible();

  // ⋯ menu → pick the Dawn gradient → cover band appears in the editor.
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: 'Cover: Dawn' }).click();
  const cover = page.locator('[data-testid="doc-cover"]');
  await expect(cover).toBeVisible();
  expect(await cover.evaluate((el) => el.style.background)).toContain('linear-gradient');

  // Persisted server-side.
  const pid = await getProjectId(request);
  await expect
    .poll(async () => ((await (await request.get(`/api/projects/${pid}/documents/${doc.id}`)).json()) as { cover: string | null }).cover)
    .toBe('dawn');

  // Reader view: chrome-free render with the cover band and the doc title.
  await page.goto(`/docs/${doc.id}/read`);
  await expect(page.locator('[data-testid="reader-cover"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Signature W2 reader doc' })).toBeVisible();
  await expect(page.getByRole('link', { name: /back to editor/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /print/i })).toBeVisible();
  // App chrome (sidebar nav) is absent.
  await expect(page.getByRole('link', { name: 'Roadmap' })).toHaveCount(0);

  expect((await request.delete(`/api/projects/${pid}/documents/${doc.id}`)).ok()).toBe(true);
});

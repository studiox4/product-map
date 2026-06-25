import { test, expect, type Page } from '@playwright/test';
import { getFeatureByTitle, getFeatures, getProjectId } from './helpers';

// Signature set Wave 1 (docs/superpowers/specs/2026-06-10-signature-set-design.md)
// W1-1 — theme toggle cycles light/dark/system, persists, dark actually applied.
// W1-2 — ⌘K palette: open, fuzzy search, create-feature-in-Later end-to-end;
//        '?' shortcuts overlay; j/k+Enter in the docs table.
// W1-3 — morph nav smoke: board card → peek → feature page completes, with
//        startViewTransition stubbed where headless Chromium lacks it.
// W1-4 — 🚀 vote fires a particle burst; hover-prefetch issues the detail
//        request before any click.

test.describe.configure({ mode: 'serial' });

const BOARD_FEATURE = 'Now-next-later board';
const EDITOR_FEATURE = 'Rich markdown editor';

/** Stub the View Transitions API when the headless build lacks it (W1-3). */
async function stubViewTransitions(page: Page) {
  await page.addInitScript(() => {
    const doc = document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => unknown;
    };
    if (typeof doc.startViewTransition !== 'function') {
      doc.startViewTransition = (cb: () => void | Promise<void>) => {
        const updateCallbackDone = Promise.resolve(cb());
        return {
          updateCallbackDone,
          ready: updateCallbackDone,
          finished: updateCallbackDone,
          skipTransition() {},
        };
      };
    }
  });
}

test('W1-1: theme toggle cycles to dark, applies Studio Ink, persists across reload', async ({
  page,
}) => {
  await page.goto('/app');
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);

  // Stored default is "system"; cycle order is light → dark → system.
  const toggle = page.getByRole('button', { name: /theme — switch to/i });
  await toggle.click(); // system → light
  await expect(html).not.toHaveClass(/dark/);
  await toggle.click(); // light → dark
  await expect(html).toHaveClass(/dark/);

  // Dark is actually painted: body carries the Studio Ink field gradient.
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  expect(bodyBg).toContain('rgb(16, 20, 24)'); // #101418

  // Persisted + applied before paint on reload (inline script, no flash).
  expect(await page.evaluate(() => localStorage.getItem('pmTheme'))).toBe('dark');
  await page.reload();
  await expect(html).toHaveClass(/dark/);

  // Cycle back to system so later tests run on the light field.
  await toggle.click();
  await expect(html).not.toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('pmTheme'))).toBe('system');
});

test('W1-2: ⌘K opens the palette and fuzzy-finds features and docs', async ({ page }) => {
  await page.goto('/app');
  // Wait for the page to be interactive before sending the keyboard shortcut.
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByPlaceholder(/type a command or search/i);
  await expect(input).toBeVisible();

  await input.fill('gantt');
  await expect(page.getByText(`Feature: Gantt roadmap`)).toBeVisible();
  await expect(page.getByText(`Feature: ${BOARD_FEATURE}`)).toBeHidden();

  await input.fill('prd');
  await expect(page.getByText(/Doc: Rich markdown editor — PRD — PRD/)).toBeVisible();

  // Second ⌘K closes.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(input).toBeHidden();
});

test('W1-2: create-feature-in-Later via palette works end-to-end', async ({
  page,
  request,
}) => {
  const title = `Palette-born feature ${Date.now()}`;
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByPlaceholder(/type a command or search/i);
  await input.fill('new feature in later');
  await page.getByText(/New feature in Later…/).click();

  const titleInput = page.getByPlaceholder(/created in Later/i);
  await titleInput.fill(title);
  await page.keyboard.press('Enter');

  // Lands on the new feature page.
  await expect(page).toHaveURL(/\/app\/features\/[0-9a-f-]+$/);
  await expect(page.getByRole('textbox', { name: 'Feature title' })).toHaveValue(title);

  // Persisted server-side in the Later horizon.
  const created = await getFeatureByTitle(request, title);
  expect(created.horizon).toBe('later');

  // Clean up so the seeded board stays pristine for later specs.
  // Delete is now archive (soft); archiving hides it from the board.
  const pid = await getProjectId(request);
  const res = await request.post(`/api/projects/${pid}/features/${created.id}/archive`);
  expect(res.ok()).toBe(true);
});

test("W1-2: '?' opens the keyboard shortcuts overlay (not while typing)", async ({ page }) => {
  await page.goto('/app/docs');
  // While typing in the search input, '?' must NOT open the overlay.
  const search = page.getByRole('searchbox', { name: /search docs/i });
  await search.click();
  await search.press('?');
  await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeHidden();
  await search.fill(''); // restore the list and leave the field
  await search.evaluate((el) => (el as HTMLInputElement).blur());

  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeHidden();
});

test('W1-2: j/k + Enter navigate the docs table', async ({ page }) => {
  await page.goto('/app/docs');
  await expect(page.getByRole('row').filter({ hasText: 'PRD' }).first()).toBeVisible();

  await page.keyboard.press('j');
  await page.keyboard.press('j');
  await page.keyboard.press('k');
  await page.keyboard.press('Enter');

  // Enter opens the read-only preview sheet for the selected row.
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('link', { name: /open in editor/i })).toBeVisible();
});

test('W1-3: board card → peek → feature page morph nav completes', async ({
  page,
  request,
}) => {
  const feature = await getFeatureByTitle(request, BOARD_FEATURE);
  await stubViewTransitions(page);
  await page.goto('/app/board');

  const card = page.getByRole('button', { name: BOARD_FEATURE, exact: true });
  await expect(card).toBeVisible();

  // Shared-element morph name is set on the card (Chromium pairs it with the
  // feature page header block).
  const vtName = await card.evaluate(
    (el) => getComputedStyle(el).getPropertyValue('view-transition-name'),
  );
  expect(vtName.trim()).toBe(`feature-${feature.id}`);

  // Card click runs inside navigateWithTransition → peek opens.
  await card.click();
  await expect(page).toHaveURL(new RegExp(`feature=${feature.id}`));
  const peek = page.getByRole('dialog');
  await expect(peek).toBeVisible();

  // Peek → full feature page completes.
  await peek.getByRole('button', { name: /open feature/i }).click();
  await expect(page).toHaveURL(new RegExp(`/app/features/${feature.id}$`));
  await expect(page.getByRole('textbox', { name: 'Feature title' })).toHaveValue(BOARD_FEATURE);
});

test('W1-3: reduced motion skips startViewTransition entirely', async ({ page, request }) => {
  const feature = await getFeatureByTitle(request, BOARD_FEATURE);
  await stubViewTransitions(page);
  await page.addInitScript(() => {
    (window as Window & { __vtCalls?: number }).__vtCalls = 0;
    const doc = document as Document & {
      startViewTransition: (cb: () => void | Promise<void>) => unknown;
    };
    const original = doc.startViewTransition.bind(doc);
    doc.startViewTransition = (cb: () => void | Promise<void>) => {
      (window as Window & { __vtCalls?: number }).__vtCalls! += 1;
      return original(cb);
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/board');

  await page.getByRole('button', { name: BOARD_FEATURE, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`feature=${feature.id}`));
  expect(await page.evaluate(() => (window as Window & { __vtCalls?: number }).__vtCalls)).toBe(0);
});

test('W1-4: 🚀 vote fires a particle burst from the button', async ({ page, request }) => {
  const feature = await getFeatureByTitle(request, EDITOR_FEATURE);
  await page.goto(`/app/features/${feature.id}`);

  const boost = page.getByRole('button', { name: 'Boost' }).first();
  await expect(boost).toBeVisible();

  // Particles live ≤500ms — count them with a MutationObserver instead of racing.
  await page.evaluate(() => {
    const w = window as Window & { __particles?: number };
    w.__particles = 0;
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && node.dataset.delight === 'particle') {
            w.__particles! += 1;
          }
        });
      }
    }).observe(document.body, { childList: true });
  });

  // Casting (not clearing) bursts — if my vote is already a boost, clear first.
  if ((await boost.getAttribute('aria-pressed')) === 'true') {
    await boost.click();
    await expect(boost).toHaveAttribute('aria-pressed', 'false');
  }
  await boost.click();

  await page.waitForFunction(
    () => ((window as Window & { __particles?: number }).__particles ?? 0) >= 6,
  );

  // Restore the seeded vote state for later specs.
  await boost.click();
  await expect(boost).toHaveAttribute('aria-pressed', 'false');
});

test('W1-4: hovering a board card prefetches the feature detail before click', async ({
  page,
  request,
}) => {
  const features = await getFeatures(request);
  const feature = features.find((f) => f.title === EDITOR_FEATURE)!;
  await page.goto('/app/board');

  const card = page.getByRole('button', { name: EDITOR_FEATURE, exact: true });
  await expect(card).toBeVisible();

  // No clicks anywhere — the detail GET must come from hover alone
  // (150ms debounce in makeHoverPrefetch).
  const pid = await getProjectId(request);
  const prefetch = page.waitForRequest(
    (req) => req.method() === 'GET' && new URL(req.url()).pathname === `/api/projects/${pid}/features/${feature.id}`,
    { timeout: 5_000 },
  );
  await card.hover();
  await prefetch;
  await expect(page).toHaveURL(/\/app\/board$/); // still on the board, never clicked
});

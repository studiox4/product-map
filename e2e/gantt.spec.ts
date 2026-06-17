import { test, expect } from '@playwright/test';
import { addDaysIso, getFeatureByTitle, getFeatures } from './helpers';

// AC5 — /roadmap renders bars for all dated features + unscheduled tray for dateless.
// Bar drag ~1 month → toast + persisted. Right-edge resize → endDate persists.
// Tray drag onto timeline → feature gains dates.

test.describe.configure({ mode: 'serial' });

test('AC5: bars for all dated features, tray chips for dateless ones', async ({
  page,
  request,
}) => {
  const features = await getFeatures(request);
  const dated = features.filter((f) => f.startDate && f.endDate);
  const dateless = features.filter((f) => !f.startDate || !f.endDate);
  expect(dated.length).toBeGreaterThanOrEqual(6);
  expect(dateless.length).toBeGreaterThanOrEqual(1);

  await page.goto('/app/roadmap');
  await expect(page.locator('[data-gantt-bar-id]').first()).toBeVisible();
  await expect(page.locator('[data-gantt-bar-id]')).toHaveCount(dated.length);
  await expect(page.locator('[data-testid^="gantt-tray-chip-"]')).toHaveCount(dateless.length);
});

test('AC5: dragging a bar right by ~1 month persists shifted dates', async ({
  page,
  request,
}) => {
  const before = await getFeatureByTitle(request, 'Rich markdown editor');
  const shiftDays = 30; // 30 days × 4 px/day = 120 px

  await page.goto('/app/roadmap');
  const bar = page.getByTestId(`gantt-bar-${before.id}`);
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;

  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + shiftDays * 4, y, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByText(/Moved 'Rich markdown editor'/)).toBeVisible();

  await page.reload();
  const after = await getFeatureByTitle(request, 'Rich markdown editor');
  expect(after.startDate).toBe(addDaysIso(before.startDate!, shiftDays));
  expect(after.endDate).toBe(addDaysIso(before.endDate!, shiftDays));
});

test('AC5: resizing via the right edge persists a new end date', async ({ page, request }) => {
  const before = await getFeatureByTitle(request, 'Gantt roadmap');
  const extraDays = 10; // 10 days × 4 px/day = 40 px

  await page.goto('/app/roadmap');
  const handle = page.getByTestId(`gantt-resize-${before.id}`);
  const box = (await handle.boundingBox())!;

  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + extraDays * 4, y, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByText(/Moved 'Gantt roadmap'/)).toBeVisible();

  await page.reload();
  const after = await getFeatureByTitle(request, 'Gantt roadmap');
  expect(after.startDate).toBe(before.startDate);
  expect(after.endDate).toBe(addDaysIso(before.endDate!, extraDays));
});

test('AC5: dragging a tray chip onto the timeline schedules the feature', async ({
  page,
  request,
}) => {
  const feature = await getFeatureByTitle(request, 'Realtime collaboration (Yjs)');
  expect(feature.startDate).toBeNull();

  await page.goto('/app/roadmap');
  const chip = page.getByTestId(`gantt-tray-chip-${feature.id}`);
  await expect(chip).toBeVisible();
  const chipBox = (await chip.boundingBox())!;
  const plotBox = (await page.locator('[data-gantt-plot]').boundingBox())!;

  // Drop inside the plot area, well right of the 200px gutter.
  const dropX = plotBox.x + 200 + 300;
  const dropY = plotBox.y + 60;
  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropX, dropY, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByText(/Scheduled 'Realtime collaboration/)).toBeVisible();

  await expect
    .poll(async () => {
      const f = await getFeatureByTitle(request, 'Realtime collaboration (Yjs)');
      return Boolean(f.startDate && f.endDate);
    })
    .toBe(true);

  const scheduled = await getFeatureByTitle(request, 'Realtime collaboration (Yjs)');
  expect(scheduled.endDate).toBe(addDaysIso(scheduled.startDate!, 14));

  // The chip leaves the tray and the feature gains a bar.
  await page.reload();
  await expect(page.getByTestId(`gantt-tray-chip-${feature.id}`)).toHaveCount(0);
  await expect(page.getByTestId(`gantt-bar-${feature.id}`)).toBeVisible();
});

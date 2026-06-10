import { test, expect } from '@playwright/test';
import { ONE_PX_PNG, createDocument, getFeatureByTitle } from './helpers';

// AC7 — upload an image in the editor → renders inline → persists across reload,
// served from /uploads/.

test('AC7: uploaded image renders inline and persists across reload', async ({
  page,
  request,
}) => {
  const feature = await getFeatureByTitle(request, 'Now-next-later board');
  const doc = await createDocument(request, {
    featureId: feature.id,
    type: 'tech_spec',
    title: 'Image upload e2e doc',
    fromTemplate: false,
  });

  await page.goto(`/docs/${doc.id}`);
  const body = page.locator('[aria-label="Document body"]');
  await expect(body).toBeVisible();
  await body.click();

  // Insert an image via the slash menu (opens the hidden file picker).
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.keyboard.type('/image');
  await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
  await page.keyboard.press('Enter');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: ONE_PX_PNG,
  });

  const img = body.locator('img[src^="/uploads/"]');
  await expect(img).toBeVisible();
  const src = await img.getAttribute('src');
  expect(src).toMatch(/^\/uploads\/.+\.png$/);

  // Saved, then persists across reload.
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  const persisted = body.locator(`img[src="${src}"]`);
  await expect(persisted).toBeVisible();

  // Served from /uploads/ with the right bytes.
  const res = await request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/png');
  expect((await res.body()).equals(ONE_PX_PNG)).toBe(true);
});

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AdmZip from 'adm-zip';
import { createDocument, getFeatureByTitle, getFeatures, getProjectId } from './helpers';

// AC6 — editor "Export .md" downloads markdown containing the doc's headings;
// GET /api/export.zip returns one folder per feature containing its docs as .md.

test('AC6: "Export .md" downloads markdown with the doc headings', async ({
  page,
  request,
}) => {
  const feature = await getFeatureByTitle(request, 'AI doc drafting');
  const doc = await createDocument(request, {
    featureId: feature.id,
    type: 'prd',
    title: 'Export e2e PRD',
    fromTemplate: true,
  });

  await page.goto(`/docs/${doc.id}`);
  await expect(page.locator('[aria-label="Document body"]')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export .md' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const markdown = await readFile((await download.path())!, 'utf8');
  expect(markdown).toContain('# Export e2e PRD');
  expect(markdown).toContain('## Requirements');
  expect(markdown).toContain('## Problem & opportunity');
});

test('AC6: /api/export.zip contains a folder per feature with .md docs', async ({
  request,
}) => {
  const pid = await getProjectId(request);
  const res = await request.get(`/api/projects/${pid}/export.zip`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('zip');

  const zip = new AdmZip(await res.body());
  const names = zip.getEntries().map((e) => e.entryName);
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    expect(name).toMatch(/^[a-z0-9-]+\/[^/]+\.md$/); // <feature-slug>/<doc-slug>.md
  }

  // Every feature that has docs gets a folder; seeded PRD is present and non-empty.
  const features = await getFeatures(request);
  for (const f of features.filter((f) => f.documents.length > 0)) {
    const slug = f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    expect(names.some((n) => n.startsWith(`${slug}/`))).toBe(true);
  }
  const prdEntry = names.find((n) => n.startsWith('rich-markdown-editor/') && n.endsWith('.md'));
  expect(prdEntry).toBeTruthy();
  expect(zip.readAsText(prdEntry!).length).toBeGreaterThan(0);
});

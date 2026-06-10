import { test, expect } from '@playwright/test';
import { MOCK_SSE_BODY, createDocument, getFeatureByTitle } from './helpers';

// AC8 — with AI enabled an empty doc shows "Draft with AI"; brief → content streams
// into the editor and ends with a structured doc (SSE endpoint mocked).
// AC9 — with AI disabled no AI affordances are visible; everything else works.

test('AC8: Draft with AI streams mocked SSE content into the editor', async ({
  page,
  request,
}) => {
  const feature = await getFeatureByTitle(request, 'AI doc drafting');
  const doc = await createDocument(request, {
    featureId: feature.id,
    type: 'prd',
    title: 'AI drafted PRD (e2e)',
    fromTemplate: false,
  });

  await page.route('**/api/ai/status', (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route('**/api/ai/generate-doc', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: MOCK_SSE_BODY,
    }),
  );

  await page.goto(`/docs/${doc.id}`);

  // Empty doc + AI enabled → the draft card is visible.
  await expect(page.getByText('Draft this document with AI')).toBeVisible();
  await page
    .getByPlaceholder('Describe the feature in a sentence or two')
    .fill('An AI assistant that drafts product docs from a one-line brief.');
  await page.getByRole('button', { name: 'Draft with AI' }).click();

  // Streamed content lands in the editor, ending with a structured doc.
  const body = page.locator('[aria-label="Document body"]');
  await expect(body.getByRole('heading', { name: 'Demo draft' })).toBeVisible();
  await expect(body.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(body.getByRole('heading', { name: 'Requirements' })).toBeVisible();
  await expect(body.getByText('Must stream progressively')).toBeVisible();

  // The finished draft autosaves (real PATCH — only the AI routes are mocked).
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Draft card disappears once the doc has content; content survives a reload.
  await page.unroute('**/api/ai/generate-doc');
  await page.reload();
  await expect(body.getByRole('heading', { name: 'Requirements' })).toBeVisible();
  await expect(page.getByText('Draft this document with AI')).toHaveCount(0);
});

test('AC9: without a key there are no AI affordances, editor still works', async ({
  page,
  request,
}) => {
  const feature = await getFeatureByTitle(request, 'AI doc drafting');
  const doc = await createDocument(request, {
    featureId: feature.id,
    type: 'feature_brief',
    title: 'No-AI doc (e2e)',
    fromTemplate: false,
  });

  await page.route('**/api/ai/status', (route) =>
    route.fulfill({ json: { enabled: false } }),
  );

  await page.goto(`/docs/${doc.id}`);
  const body = page.locator('[aria-label="Document body"]');
  await expect(body).toBeVisible();

  // No AI affordances anywhere on the page.
  await expect(page.getByText('Draft this document with AI')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Draft with AI' })).toHaveCount(0);

  // Everything else fully works: typing autosaves.
  await body.click();
  await page.keyboard.type('Works fine without AI.');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 });
});

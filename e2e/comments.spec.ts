import { test, expect, type APIRequestContext } from '@playwright/test';

// Comments & voting addendum — comments ACs:
// AC1 — comment on a doc from the editor sheet and on a feature from its page;
//       replies nest one level; reply-to-reply rejected by the API (400).
// AC2 — resolve collapses into the resolved group; reopen restores; both write
//       activity entries visible in the feature feed.
// AC3 — attention panel shows "N open comments" per feature (doc + feature
//       combined); resolves drop the count; zero unresolved → item gone.
// AC6 — author shows name + avatar color; only authors see edit/delete on
//       their own comments (different localStorage user hides them).

test.describe.configure({ mode: 'serial' });

const FEATURE_TITLE = 'Comments Verification Feature';
let featureId = '';
let docId = '';

async function createUser(request: APIRequestContext, name: string) {
  const res = await request.post('/api/users', { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; name: string; color: string };
}

test.beforeAll(async ({ request }) => {
  const featureRes = await request.post('/api/features', {
    data: { title: FEATURE_TITLE, horizon: 'later' },
  });
  expect(featureRes.status()).toBe(201);
  featureId = ((await featureRes.json()) as { id: string }).id;

  const docRes = await request.post('/api/documents', {
    data: { featureId, type: 'prd', title: 'Comments Verification PRD', fromTemplate: true },
  });
  expect(docRes.status()).toBe(201);
  docId = ((await docRes.json()) as { id: string }).id;
});

test('AC1: comment + one-level reply on the feature page; reply-to-reply is API-rejected', async ({
  page,
  request,
}) => {
  await page.goto(`/features/${featureId}`);

  const comments = page.locator('section[aria-label="Comments"]');
  await expect(comments.getByText('No comments yet — start the discussion.')).toBeVisible();

  // Root comment via the composer.
  await comments.getByLabel('Add a comment…').fill('First feature thread');
  await comments.getByRole('button', { name: 'Comment', exact: true }).click();

  const thread = comments.getByRole('article', { name: /^Thread by / });
  await expect(thread).toBeVisible();
  await expect(thread.getByText('First feature thread')).toBeVisible();

  // Reply nests one level under the root.
  await thread.getByRole('button', { name: 'Reply', exact: true }).click();
  await thread.getByLabel('Reply…').fill('Nested reply');
  await thread.getByRole('button', { name: 'Reply', exact: true }).last().click();
  await expect(thread.getByText('Nested reply')).toBeVisible();

  // No reply affordance on the reply itself (single Reply action per thread)
  // and the API rejects reply-to-reply with 400.
  await expect(thread.getByRole('button', { name: 'Reply', exact: true })).toHaveCount(1);

  const listRes = await request.get(`/api/comments?featureId=${featureId}`);
  expect(listRes.ok()).toBeTruthy();
  const threads = (await listRes.json()) as { id: string; replies: { id: string }[] }[];
  const replyId = threads[0]?.replies[0]?.id;
  expect(replyId).toBeTruthy();

  const replyToReply = await request.post('/api/comments', {
    data: { featureId, parentId: replyId, body: 'too deep' },
  });
  expect(replyToReply.status()).toBe(400);
});

test('AC1: comment on a doc from the editor sheet; toolbar badge counts unresolved', async ({
  page,
}) => {
  await page.goto(`/docs/${docId}`);

  // Comment pill with no badge yet → opens the non-modal sheet.
  const toggle = page.getByRole('button', { name: /^Comments/ });
  await expect(toggle).toBeVisible();
  await toggle.click();

  const sheet = page.getByRole('dialog', { name: 'Comments' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('No comments yet — start the discussion.')).toBeVisible();

  await sheet.getByLabel('Add a comment…').fill('Doc thread from the editor sheet');
  await sheet.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(sheet.getByText('Doc thread from the editor sheet')).toBeVisible();

  // Unresolved-count badge on the toolbar pill.
  await expect(page.getByRole('button', { name: 'Comments (1 unresolved)' })).toBeVisible();

  // Editor stays usable underneath the non-modal sheet.
  await expect(page.locator('[aria-label="Document body"]')).toBeVisible();
});

test('AC2: resolve collapses into the resolved group, reopen restores, both hit the feed', async ({
  page,
}) => {
  await page.goto(`/features/${featureId}`);
  const comments = page.locator('section[aria-label="Comments"]');
  const thread = comments.getByRole('article', { name: /^Thread by / });
  await expect(thread).toBeVisible();

  // Resolve → thread leaves the open list and collapses under "1 resolved".
  await thread.getByRole('button', { name: 'Resolve', exact: true }).click();
  const resolvedToggle = comments.getByRole('button', { name: /1 resolved/ });
  await expect(resolvedToggle).toBeVisible();
  await expect(comments.getByText('First feature thread')).toBeHidden();

  // Expand the resolved group → sage Resolved chip + Reopen.
  await resolvedToggle.click();
  const resolvedThread = comments.getByRole('article', { name: /\(resolved\)$/ });
  await expect(resolvedThread.getByText('First feature thread')).toBeVisible();
  await expect(resolvedThread.getByText('Resolved', { exact: true })).toBeVisible();

  // Reopen restores the thread to the open list.
  await resolvedThread.getByRole('button', { name: 'Reopen' }).click();
  await expect(comments.getByRole('button', { name: /1 resolved/ })).toBeHidden();
  await expect(comments.getByText('First feature thread')).toBeVisible();

  // Both actions wrote feature-feed activity (plus the original comments).
  const activity = page.locator('section[aria-label="Activity"]');
  await expect(activity.getByText('resolved a comment thread').first()).toBeVisible();
  await expect(activity.getByText('reopened a comment thread').first()).toBeVisible();
  await expect(activity.getByText(/commented ·/).first()).toBeVisible();
  await expect(activity.getByText('commented on a doc').first()).toBeVisible();
});

test('AC3: attention panel counts unresolved threads (feature + doc) and clears at zero', async ({
  page,
}) => {
  // One unresolved feature thread + one unresolved doc thread → 2 open comments.
  await page.goto('/');
  const attention = page.locator('section', {
    has: page.getByRole('heading', { name: 'Needs attention' }),
  });
  const item = attention.getByRole('button', { name: `${FEATURE_TITLE} 2 open comments` });
  await expect(item).toBeVisible();

  // Click-through lands on the feature page comments section.
  await item.click();
  await expect(page).toHaveURL(new RegExp(`/features/${featureId}#comments`));

  // Resolve the feature thread → count drops to 1.
  const comments = page.locator('section[aria-label="Comments"]');
  await comments
    .getByRole('article', { name: /^Thread by / })
    .getByRole('button', { name: 'Resolve', exact: true })
    .click();
  await expect(comments.getByRole('button', { name: /1 resolved/ })).toBeVisible();

  await page.goto('/');
  await expect(
    attention.getByRole('button', { name: `${FEATURE_TITLE} 1 open comment` }),
  ).toBeVisible();

  // Resolve the doc thread too → zero unresolved → item gone.
  await page.goto(`/docs/${docId}`);
  await page.getByRole('button', { name: 'Comments (1 unresolved)' }).click();
  const sheet = page.getByRole('dialog', { name: 'Comments' });
  await sheet
    .getByRole('article', { name: /^Thread by / })
    .getByRole('button', { name: 'Resolve', exact: true })
    .click();
  await expect(sheet.getByRole('button', { name: /1 resolved/ })).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  await expect(
    attention.getByRole('button', { name: new RegExp(`${FEATURE_TITLE} \\d+ open comment`) }),
  ).toBeHidden();
});

test('AC6: author identity renders and edit/delete is gated to own comments', async ({
  page,
  request,
}) => {
  const author = await createUser(request, 'Avery Author');
  const viewer = await createUser(request, 'Vic Viewer');

  // Comment as Avery (x-user-id header mirrors the web client).
  const created = await request.post('/api/comments', {
    data: { featureId, body: 'Gated actions thread' },
    headers: { 'x-user-id': author.id },
  });
  expect(created.status()).toBe(201);

  // Viewing as Avery: name, avatar color and the ⋯ actions menu are present.
  // Let the app's silent identity adoption settle first, or it can overwrite
  // the id we set (it only writes when localStorage.pmUserId is empty).
  await page.goto(`/features/${featureId}`);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('pmUserId')))
    .not.toBeNull();
  await page.evaluate((id) => localStorage.setItem('pmUserId', id), author.id);
  await page.reload();
  const thread = page.getByRole('article', { name: 'Thread by Avery Author' });
  await expect(thread.getByText('Avery Author')).toBeVisible();
  const avatar = thread.locator('span[aria-label="Avery Author"]').first();
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveCSS('background-color', /^rgb\(/); // colored avatar dot
  await expect(thread.getByRole('button', { name: 'Comment actions' })).toBeVisible();

  // Edit own comment through the menu.
  await thread.getByRole('button', { name: 'Comment actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await thread.getByLabel('Edit comment…').fill('Gated actions thread (edited)');
  await thread.getByRole('button', { name: 'Save' }).click();
  await expect(thread.getByText('Gated actions thread (edited)')).toBeVisible();

  // Switching localStorage.pmUserId to a different user hides edit/delete.
  await page.evaluate((id) => localStorage.setItem('pmUserId', id), viewer.id);
  await page.reload();
  const threadAsViewer = page.getByRole('article', { name: 'Thread by Avery Author' });
  await expect(threadAsViewer.getByText('Gated actions thread (edited)')).toBeVisible();
  await expect(threadAsViewer.getByRole('button', { name: 'Comment actions' })).toBeHidden();
  // The API enforces it too.
  const listRes = await request.get(`/api/comments?featureId=${featureId}`);
  const threads = (await listRes.json()) as { id: string; body: string }[];
  const target = threads.find((t) => t.body.includes('Gated actions'));
  expect(target).toBeTruthy();
  const forbidden = await request.delete(`/api/comments/${target!.id}`, {
    headers: { 'x-user-id': viewer.id },
  });
  expect(forbidden.status()).toBe(403);
});

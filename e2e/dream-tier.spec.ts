// Dream tier (D1–D9) verification: idea inbox, evidence, decisions,
// dependencies, capacity, releases, outcomes, share, copilot.
//
// AI surfaces are exercised through page.route mocks (no AWS creds in this
// env); the API-side positive paths (promote-with-brief, suggest-decision
// prompt content, chat retrieval ranking) are covered by the api unit tests
// with injected mock models.
import { test, expect, type Page } from '@playwright/test';
import { getFeatureByTitle } from './helpers';

/** Pretend the workspace has an AI key so AI affordances render. */
async function enableAi(page: Page) {
  await page.route('**/api/ai/status', (route) => route.fulfill({ json: { enabled: true } }));
}

function sseBody(chunks: string[]): string {
  return [
    ...chunks.map((text) => `event: chunk\ndata: ${JSON.stringify({ text })}\n\n`),
    'event: done\ndata: {}\n\n',
  ].join('');
}

// ---------------------------------------------------------------------------
// AC1 — idea lifecycle: capture → vote → promote → feature + promoted badge.
// ---------------------------------------------------------------------------
test('AC1: idea lifecycle — create, vote, promote to Later, feature linked', async ({
  page,
  request,
}) => {
  await enableAi(page);
  await page.goto('/inbox');

  // Seeded ideas render with vote pills.
  await expect(page.getByText('Slack notifications for resolved threads')).toBeVisible();

  // Capture a new idea.
  await page.getByRole('button', { name: 'New idea' }).first().click();
  await page.getByLabel('Title').fill('Public API for roadmap data');
  await page.getByLabel('Details').fill('Partners keep asking for **JSON** access.');
  await page.getByLabel('Source').fill('partner call');
  await page.getByRole('button', { name: 'Capture' }).click();

  const detail = page.getByRole('region', { name: 'Idea detail' });
  await expect(detail.getByRole('heading', { name: 'Public API for roadmap data' })).toBeVisible();
  await expect(detail.getByText('Source: partner call')).toBeVisible();

  // Vote it up from the detail pane.
  await detail.getByRole('group', { name: 'Idea votes' }).getByLabel('Boost').click();
  await expect(detail.locator('[data-testid="idea-vote-score"]')).toHaveText('+1');

  // Promote to Later. AI brief checkbox is visible (AI mocked-on); the API
  // skips the brief silently because the server has no model — the
  // brief-created path is unit-tested with a mock model in apps/api.
  await detail.getByRole('button', { name: 'Promote to feature' }).click();
  await page.getByRole('radio', { name: 'Later' }).click();
  await expect(page.getByLabel('Draft AI brief')).toBeVisible();
  await page.getByLabel('Draft AI brief').check();
  await page.getByRole('button', { name: 'Promote', exact: true }).click();

  // Idea is marked promoted and links to the new feature.
  await expect(detail.getByText('Promoted', { exact: true })).toBeVisible();
  await detail.getByRole('link', { name: 'View feature' }).click();
  await expect(page.getByLabel('Feature title')).toHaveValue('Public API for roadmap data');
  // Description copied from the idea body.
  await expect(page.getByText('Partners keep asking for')).toBeVisible();

  // Activity logged (idea_promoted).
  await expect(
    page
      .getByRole('region', { name: 'Activity' })
      .getByText('promoted this from the idea inbox'),
  ).toBeVisible();

  // Cleanup: remove the promoted feature so later specs see the seeded board.
  const feature = await getFeatureByTitle(request, 'Public API for roadmap data');
  await request.delete(`/api/features/${feature.id}`);
});

// ---------------------------------------------------------------------------
// AC2 — evidence: quote + weighted ticket cards, kind icons, delete.
// ---------------------------------------------------------------------------
test('AC2: evidence — add quote and ticket(×12), icons render, delete works', async ({
  page,
  request,
}) => {
  const ecs = await getFeatureByTitle(request, 'ECS deployment');
  await page.goto(`/features/${ecs.id}`);

  const section = page.getByRole('region', { name: 'Evidence' });
  await expect(section).toBeVisible();

  // Add a quote.
  await section.getByRole('button', { name: 'Add evidence' }).click();
  await page.getByLabel('Title', { exact: true }).fill('CTO: deploys are the blocker');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  const quoteCard = section.locator('li', { hasText: 'CTO: deploys are the blocker' });
  await expect(quoteCard).toBeVisible();
  await expect(quoteCard.getByLabel('Quote')).toBeVisible();

  // Add a ticket-count with weight 12.
  await section.getByRole('button', { name: 'Add evidence' }).click();
  await page.getByLabel('Evidence kind').click();
  await page.getByRole('option', { name: 'Ticket' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Tickets asking for one-click deploys');
  await page.getByLabel('Weight').fill('12');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  const ticketCard = section.locator('li', { hasText: 'Tickets asking for one-click deploys' });
  await expect(ticketCard).toBeVisible();
  await expect(ticketCard.getByLabel('Ticket', { exact: true })).toBeVisible();
  await expect(ticketCard.getByText('×12')).toBeVisible();

  // Delete both (hover reveals the X).
  for (const title of [
    'CTO: deploys are the blocker',
    'Tickets asking for one-click deploys',
  ]) {
    const card = section.locator('li', { hasText: title });
    await card.hover();
    await card.getByRole('button', { name: `Delete evidence ${title}` }).click();
    await expect(card).toHaveCount(0);
  }
});

// ---------------------------------------------------------------------------
// AC3 — decisions: AI-suggested prefill from a resolved thread + manual create.
// ---------------------------------------------------------------------------
test('AC3: log decision from resolved thread (mocked AI) and manual decision', async ({
  page,
  request,
}) => {
  await enableAi(page);
  await page.route('**/api/ai/suggest-decision', (route) =>
    route.fulfill({
      json: {
        suggested: true,
        title: 'Tables are in scope for the demo',
        decisionMd: 'Tables ship with the demo editor; partner feedback made them a Must.',
        alternativesMd: '- Defer tables to post-demo\n- Paste-as-image fallback',
      },
    }),
  );

  const editor = await getFeatureByTitle(request, 'Rich markdown editor');
  await page.goto(`/features/${editor.id}`);

  // Resolved threads are collapsed — expand, then log the decision.
  await page.getByRole('button', { name: /resolved/ }).click();
  await page.getByRole('button', { name: 'Log decision' }).first().click();

  // Prefilled dialog from the (mocked) suggestion.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Title')).toHaveValue('Tables are in scope for the demo');
  await dialog.getByRole('button', { name: 'Save decision' }).click();

  const decisions = page.getByRole('region', { name: 'Decisions' });
  await expect(decisions.getByText('Tables are in scope for the demo')).toBeVisible();
  await expect(decisions.getByText(/partner feedback made them a Must/)).toBeVisible();

  // Expandable alternatives.
  await decisions.getByRole('button', { name: 'Alternatives considered' }).first().click();
  await expect(decisions.getByText('Defer tables to post-demo')).toBeVisible();

  // Manual decision creation (no AI involved) renders too.
  const created = await request.post('/api/decisions', {
    data: {
      featureId: editor.id,
      title: 'Manual decision: keep turndown',
      decisionMd: 'We keep turndown for md derivation.',
    },
  });
  expect(created.status()).toBe(201);
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Decisions' }).getByText('Manual decision: keep turndown'),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// AC4 — dependencies: rail edit, blocked badges, cycle 400 toast, ship clears.
// ---------------------------------------------------------------------------
test('AC4: dependencies — badge, board chip, gantt arrow, cycle toast, ship clears', async ({
  page,
  request,
}) => {
  // Seeded edge (board → voting) draws an arrow between two dated bars.
  await page.goto('/roadmap');
  // (the first <path> lives inside the <marker> def, so target the bezier)
  await expect(
    page.locator('[data-testid="gantt-dependency-arrows"] path[marker-end]').first(),
  ).toBeVisible();

  // Throwaway pair so nothing seeded is disturbed.
  const mk = async (title: string) => {
    const res = await request.post('/api/features', {
      data: { title, horizon: 'later' },
    });
    expect(res.status()).toBe(201);
    return (await res.json()) as { id: string };
  };
  const blocker = await mk('E2E dep blocker');
  const blocked = await mk('E2E dep blocked');

  try {
    // Set the blocker via the rail popover.
    await page.goto(`/features/${blocked.id}`);
    const rail = page.getByRole('region', { name: 'Dependencies' });
    await rail.getByRole('button', { name: 'Edit' }).click();
    await page
      .locator('label', { hasText: 'E2E dep blocker' })
      .getByRole('checkbox')
      .check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(rail.getByText('Blocked by 1')).toBeVisible();

    // Board card shows the amber blocked badge.
    await page.goto('/board');
    const card = page.locator('[aria-label="E2E dep blocked"]');
    await expect(card.getByLabel('Blocked')).toBeVisible();

    // Cycle attempt: blocker blocked-by blocked → 400 + toast.
    await page.goto(`/features/${blocker.id}`);
    const blockerRail = page.getByRole('region', { name: 'Dependencies' });
    await blockerRail.getByRole('button', { name: 'Edit' }).click();
    await page
      .locator('label', { hasText: 'E2E dep blocked' })
      .getByRole('checkbox')
      .check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('That would create a loop')).toBeVisible();

    // Shipping the blocker clears the badge.
    await request.patch(`/api/features/${blocker.id}`, { data: { status: 'shipped' } });
    await page.goto(`/features/${blocked.id}`);
    await expect(page.getByRole('region', { name: 'Dependencies' })).toBeVisible();
    await expect(page.getByText('Blocked by 1')).toHaveCount(0);
  } finally {
    await request.delete(`/api/features/${blocked.id}`);
    await request.delete(`/api/features/${blocker.id}`);
  }
});

// ---------------------------------------------------------------------------
// AC5 — capacity strip: per-month load vs capacity with an overcommitted month.
// ---------------------------------------------------------------------------
test('AC5: capacity toggle shows monthly load and an overcommitted month', async ({ page }) => {
  await page.goto('/roadmap');
  await expect(page.locator('[data-testid="gantt-capacity-strip"]')).toHaveCount(0);

  await page.locator('[data-testid="capacity-toggle"]').click();
  const strip = page.locator('[data-testid="gantt-capacity-strip"]');
  await expect(strip).toBeVisible();

  // Seed produces ≥1 overcommitted month (three L features overlap July).
  await expect(strip.locator('[data-overcommitted]').first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// AC6 — releases: membership table, ship via status select → confetti/sage
// gantt milestone (dream tier 2 §7 replaced the ship-only button).
// ---------------------------------------------------------------------------
test('AC6: ship v0.2 via the status select — milestone turns sage', async ({
  page,
  request,
}) => {
  await page.goto('/releases');
  await page.getByRole('link', { name: /v0\.2 — Team ready/ }).click();

  // Membership section lists the bundled features.
  await expect(page.getByRole('table').getByText(/Comments & review/)).toBeVisible();

  // Ship it via the status select (both-ways transitions, spec §7).
  const status = page.getByRole('combobox', { name: /Status for v0\.2/ });
  await expect(status).toContainText('Planned');
  await status.click();
  await page.getByRole('option', { name: 'Shipped' }).click();
  await expect(page.getByText(/Shipped v0\.2/)).toBeVisible();
  await expect(status).toContainText('Shipped');

  // Milestone diamond on the gantt is sage (shipped).
  const releases = (await (await request.get('/api/releases')).json()) as {
    id: string;
    status: string;
  }[];
  const shipped = releases.find((r) => r.status === 'shipped');
  expect(shipped).toBeTruthy();
  await page.goto('/roadmap');
  await expect(
    page.locator(`[data-testid="gantt-milestone-${shipped!.id}"]`),
  ).toHaveAttribute('data-release-status', 'shipped');
});

// ---------------------------------------------------------------------------
// AC7 — outcomes: assign via rail; grouping + unassigned tray stay accurate.
// ---------------------------------------------------------------------------
test('AC7: assign feature to objective via rail; outcomes groups correctly', async ({
  page,
  request,
}) => {
  const realtime = await getFeatureByTitle(request, 'Realtime collaboration (Yjs)');
  await page.goto(`/features/${realtime.id}`);

  const planning = page.getByRole('region', { name: 'Planning' });
  await planning.getByLabel('Objective').click();
  await page.getByRole('option', { name: 'Win security-conscious teams' }).click();

  await page.goto('/outcomes');
  await expect(
    page.getByRole('heading', { name: 'Win security-conscious teams' }),
  ).toBeVisible();
  await expect(page.getByText('Realtime collaboration (Yjs)').first()).toBeVisible();
  // The feature left the unassigned tray.
  const tray = page.getByRole('region', { name: 'Unassigned features' });
  await expect(tray.getByText('Realtime collaboration (Yjs)')).toHaveCount(0);

  // Restore: unassign so the seeded tray stays accurate for later specs.
  await page.goto(`/features/${realtime.id}`);
  await page.getByRole('region', { name: 'Planning' }).getByLabel('Objective').click();
  await page.getByRole('option', { name: 'No objective' }).click();
  await page.goto('/outcomes');
  await expect(
    page
      .getByRole('region', { name: 'Unassigned features' })
      .getByText('Realtime collaboration (Yjs)'),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// AC8 — share: fresh-context read-only page; revoke → inactive.
// ---------------------------------------------------------------------------
test('AC8: share link — read-only roadmap in fresh context, revoke kills it', async ({
  page,
  browser,
}) => {
  await page.goto('/settings/workspace');
  await page.getByRole('button', { name: 'Create share link' }).click();
  const linkInput = page.getByLabel('Share link');
  await expect(linkInput).toBeVisible();
  const shareUrl = await linkInput.inputValue();
  expect(shareUrl).toMatch(/\/share\//);

  // Fresh browser context: no localStorage, no identity.
  const viewer = await browser.newContext();
  const viewerPage = await viewer.newPage();
  await viewerPage.goto(shareUrl);

  await expect(viewerPage.getByRole('heading', { name: 'ProductMap', level: 1 })).toBeVisible();
  await expect(viewerPage.locator('[data-share-gantt]')).toBeVisible();
  await expect(viewerPage.getByText('Made with ProductMap')).toBeVisible();
  // Shipped release (from AC6) appears in the changelog.
  await expect(viewerPage.getByRole('heading', { name: 'Changelog' })).toBeVisible();
  await expect(viewerPage.getByText('v0.2 — Team ready')).toBeVisible();
  // Zero mutating affordances: not a single button or editable field.
  expect(await viewerPage.locator('button').count()).toBe(0);
  expect(await viewerPage.locator('input, textarea, [contenteditable="true"]').count()).toBe(0);

  // Revoke → the share page goes dead.
  await page.getByRole('button', { name: 'Revoke link' }).click();
  await expect(page.getByRole('button', { name: 'Create share link' })).toBeVisible();
  await viewerPage.reload();
  await expect(viewerPage.getByText("This link isn't active")).toBeVisible();
  await viewer.close();
});

// ---------------------------------------------------------------------------
// AC9 — copilot: chat citations, nudges, AI review sheet, hidden-when-disabled.
// ---------------------------------------------------------------------------
test('AC9a: copilot chat streams with doc citation links; nudges list real items', async ({
  page,
  request,
}) => {
  await enableAi(page);
  await page.route('**/api/ai/chat', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: sseBody([
        'The editor work is scoped in ',
        '**Rich markdown editor — PRD** — tables are a Must.',
      ]),
    }),
  );

  // A dateless now-feature feeds the dateless_now nudge (cleaned up below).
  const tempRes = await request.post('/api/features', {
    data: { title: 'E2E dateless now feature', horizon: 'now' },
  });
  const temp = (await tempRes.json()) as { id: string };

  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open copilot' }).click();

    // Chat: ask, get the mocked stream, citation links to the doc.
    await page.getByPlaceholder('Ask about your workspace…').fill('What is the editor scope?');
    await page.keyboard.press('Enter');
    await expect(page.getByText('tables are a Must')).toBeVisible();
    const citation = page.locator('a[data-doc-link]', {
      hasText: 'Rich markdown editor — PRD',
    });
    await expect(citation).toBeVisible();

    // Nudges: real endpoint — seeded stale draft + our dateless now feature.
    await page.getByRole('tab', { name: 'Nudges' }).click();
    const nudges = page.getByRole('list', { name: 'Nudges' });
    await expect(nudges.getByText('Comments & review — Feature brief')).toBeVisible();
    await expect(nudges.getByText('E2E dateless now feature')).toBeVisible();
  } finally {
    await request.delete(`/api/features/${temp.id}`);
  }
});

test('AC9b: AI review streams rubric sections into the side sheet', async ({
  page,
  request,
}) => {
  await enableAi(page);
  await page.route('**/api/ai/review-doc', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: sseBody([
        '## Problem clarity\n\nCrisp (L3).\n\n',
        '## Measurable metrics\n\nAdd a target to L18.\n\n',
        '## Risks\n\nNone called out.\n',
      ]),
    }),
  );

  const editor = await getFeatureByTitle(request, 'Rich markdown editor');
  const prd = editor.documents.find((d) => d.type === 'prd');
  expect(prd).toBeTruthy();

  await page.goto(`/docs/${prd!.id}`);
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'AI review' }).click();

  const review = page.locator('[data-testid="review-content"]');
  await expect(review.getByRole('heading', { name: 'Problem clarity' })).toBeVisible();
  await expect(review.getByRole('heading', { name: 'Measurable metrics' })).toBeVisible();
  await expect(review.getByText('Add a target to L18.')).toBeVisible();
});

test('AC9c: all AI affordances hidden when AI is disabled', async ({ page, request }) => {
  await page.route('**/api/ai/status', (route) => route.fulfill({ json: { enabled: false } }));

  await page.goto('/');
  await expect(page.locator('[data-testid="pulse-heatmap"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open copilot' })).toHaveCount(0);

  // No "Log decision" sparkle on resolved threads.
  const editor = await getFeatureByTitle(request, 'Rich markdown editor');
  await page.goto(`/features/${editor.id}`);
  await page.getByRole('button', { name: /resolved/ }).click();
  await expect(page.getByRole('button', { name: 'Log decision' })).toHaveCount(0);

  // No "Draft AI brief" checkbox in the promote dialog (pick a known inbox idea).
  await page.goto('/inbox');
  await page.getByText('SSO via OIDC').click();
  await page
    .getByRole('region', { name: 'Idea detail' })
    .getByRole('button', { name: 'Promote to feature' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Draft AI brief')).toHaveCount(0);
});

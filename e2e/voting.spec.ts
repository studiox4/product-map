import { test, expect, type APIRequestContext } from '@playwright/test';

// Comments & voting addendum — voting ACs:
// AC4 — 🚀/🧊 vote, un-vote and flip all work and persist; counts and my-vote
//       tint correct after reload; one vote per user enforced.
// AC5 — board score sort reorders columns by net score, toggles back to
//       manual, and the choice survives reload.

test.describe.configure({ mode: 'serial' });

const TITLES = ['Vote Target Alpha', 'Vote Target Bravo', 'Vote Target Charlie'] as const;
const ids: Record<string, string> = {};
let voterId = '';

async function createFeature(request: APIRequestContext, title: string) {
  const res = await request.post('/api/features', { data: { title, horizon: 'later' } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test.beforeAll(async ({ request }) => {
  for (const title of TITLES) ids[title] = await createFeature(request, title);
  const userRes = await request.post('/api/users', { data: { name: 'Val Voter' } });
  expect(userRes.status()).toBe(201);
  voterId = ((await userRes.json()) as { id: string }).id;
});

test('AC4: boost, un-vote and flip from the feature page; state survives reload', async ({
  page,
}) => {
  await page.addInitScript((id) => localStorage.setItem('pmUserId', id), voterId);
  await page.goto(`/features/${ids['Vote Target Alpha']}`);

  const votes = page.getByRole('group', { name: 'Votes' });
  const boost = votes.getByRole('button', { name: 'Boost' });
  const cool = votes.getByRole('button', { name: 'Cool' });
  const score = votes.getByTestId('vote-score');

  await expect(score).toHaveText('0');
  await expect(boost).toHaveAttribute('aria-pressed', 'false');

  // Boost → +1, my-vote tint on 🚀.
  await boost.click();
  await expect(boost).toHaveAttribute('aria-pressed', 'true');
  await expect(boost).toContainText('1');
  await expect(score).toHaveText('+1');
  await expect(boost).toHaveCSS('background-color', 'rgb(220, 235, 255)'); // #dcebff

  // Persists across reload.
  await page.reload();
  await expect(boost).toHaveAttribute('aria-pressed', 'true');
  await expect(score).toHaveText('+1');

  // Clicking the active control again clears the vote.
  await boost.click();
  await expect(boost).toHaveAttribute('aria-pressed', 'false');
  await expect(score).toHaveText('0');

  // Boost then 🧊 flips the vote (one vote per user — not additive).
  await boost.click();
  await expect(score).toHaveText('+1');
  await cool.click();
  await expect(cool).toHaveAttribute('aria-pressed', 'true');
  await expect(boost).toHaveAttribute('aria-pressed', 'false');
  await expect(score).toHaveText('−1');
  await expect(cool).toContainText('1');
  await expect(boost).toContainText('0');
  await expect(cool).toHaveCSS('background-color', 'rgb(217, 242, 240)'); // #d9f2f0

  // Flip persists too.
  await page.reload();
  await expect(cool).toHaveAttribute('aria-pressed', 'true');
  await expect(score).toHaveText('−1');
});

test('AC4: one vote per user enforced; a second user adds an independent vote', async ({
  page,
  request,
}) => {
  const alphaId = ids['Vote Target Alpha'];

  // Same user voting boost twice still counts once (PK user_id+feature_id).
  for (let i = 0; i < 2; i += 1) {
    const res = await request.put(`/api/features/${alphaId}/vote`, {
      data: { value: 1 },
      headers: { 'x-user-id': voterId },
    });
    expect(res.ok()).toBeTruthy();
  }
  let summary = (await (
    await request.put(`/api/features/${alphaId}/vote`, {
      data: { value: 1 },
      headers: { 'x-user-id': voterId },
    })
  ).json()) as { score: number; boosts: number; cools: number; myVote: number };
  expect(summary).toMatchObject({ boosts: 1, cools: 0, score: 1, myVote: 1 });

  // A second user's boost is additive across users.
  const otherRes = await request.post('/api/users', { data: { name: 'Quinn Second' } });
  expect(otherRes.status()).toBe(201);
  const otherId = ((await otherRes.json()) as { id: string }).id;
  summary = (await (
    await request.put(`/api/features/${alphaId}/vote`, {
      data: { value: 1 },
      headers: { 'x-user-id': otherId },
    })
  ).json()) as typeof summary;
  expect(summary).toMatchObject({ boosts: 2, cools: 0, score: 2, myVote: 1 });

  // Board card reflects the combined score, my tint follows my own vote only.
  await page.addInitScript((id) => localStorage.setItem('pmUserId', id), otherId);
  await page.goto('/board');
  const card = page.getByRole('button', { name: 'Vote Target Alpha', exact: true });
  const votes = card.getByRole('group', { name: 'Votes' });
  await expect(votes.getByTestId('vote-score')).toHaveText('+2');
  await expect(votes.getByRole('button', { name: 'Boost' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Compact widget swallows the click — voting on a card must not open the peek.
  await votes.getByRole('button', { name: 'Boost' }).click();
  await expect(page).not.toHaveURL(/feature=/);
  await expect(votes.getByTestId('vote-score')).toHaveText('+1'); // un-voted my boost
});

test('AC5: score sort reorders the column, survives reload, and toggles back to manual', async ({
  page,
  request,
}) => {
  // Distinct net scores via the API: Bravo +1, Charlie −1, Alpha left at +1 from
  // the previous test → clear Alpha to 0 for a deterministic order.
  const put = (featureId: string, value: number, userId: string) =>
    request.put(`/api/features/${featureId}/vote`, {
      data: { value },
      headers: { 'x-user-id': userId },
    });
  await put(ids['Vote Target Alpha'], 0, voterId);
  await put(ids['Vote Target Bravo'], 1, voterId);
  await put(ids['Vote Target Charlie'], -1, voterId);

  const cardTitles = () =>
    page
      .getByTestId('column-later')
      .locator('[role="button"][aria-label^="Vote Target"] > p')
      .allTextContents();

  await page.goto('/board');
  const order = page.getByRole('group', { name: 'Board order' });
  await expect(order.getByRole('button', { name: 'manual' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Manual = insertion order.
  expect(await cardTitles()).toEqual([...TITLES]);

  // Score sort: Bravo (+1) → Alpha (0) → Charlie (−1).
  await order.getByRole('button', { name: 'score' }).click();
  await expect
    .poll(cardTitles)
    .toEqual(['Vote Target Bravo', 'Vote Target Alpha', 'Vote Target Charlie']);

  // Choice persists in localStorage across reload.
  await page.reload();
  await expect(order.getByRole('button', { name: 'score' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await cardTitles()).toEqual([
    'Vote Target Bravo',
    'Vote Target Alpha',
    'Vote Target Charlie',
  ]);

  // Back to manual restores sortOrder.
  await order.getByRole('button', { name: 'manual' }).click();
  await expect.poll(cardTitles).toEqual([...TITLES]);
});

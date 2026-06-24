import { test, expect } from '@playwright/test';
import { createDocument, getFeatureByTitle, getProjectId } from './helpers';

// Settings, templates & Bedrock spec — ACs 1-6 (UI side):
// AC1 — settings reachable from the nav gear and ⌘K; three tabs render.
// AC2 — create "Lightweight PRD", edit body in Tiptap (slash menu), set as
//       default; new-doc dialog offers both PRD templates with the new default
//       preselected; created doc uses its body with {{title}} replaced.
// AC3 — duplicate + archive; archiving the current default is blocked with a
//       clear error; archived templates hidden from the new-doc dialog.
// AC4 — workspace tab edits the vision (landing reflects), export downloads,
//       reset-demo restores the seed behind a confirm dialog.
// AC5 — profile tab renames the user and recolors the avatar; feature-page
//       people/activity avatars update.
// AC6 (negative) — with /api/ai/status false no AI affordances render
//       (positive Bedrock path needs AWS creds; covered by api unit tests).

test.describe.configure({ mode: 'serial' });

const SEED_VISION = 'Roadmaps and docs your security team will let you run.';
const FEATURE_TITLE = 'ECS deployment';

test.beforeAll(async ({ request }) => {
  // Earlier spec files mutate users/templates — start from the pristine seed.
  const res = await request.post('/api/admin/reset-demo');
  expect(res.ok()).toBe(true);
});

test('AC1: settings reachable from the nav gear and ⌘K; three tabs render', async ({ page }) => {
  await page.goto('/app');

  // Nav gear → /settings (templates tab is the index redirect).
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/app\/settings\/templates$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  // Pill tab rail renders all three tabs; each one shows its content card.
  const rail = page.getByRole('navigation', { name: 'Settings sections' });
  for (const tab of ['Templates', 'Workspace', 'Profile']) {
    await expect(rail.getByRole('link', { name: tab })).toBeVisible();
  }
  await expect(page.locator('section[aria-label="prd templates"]')).toBeVisible();
  await rail.getByRole('link', { name: 'Workspace' }).click();
  await expect(page.getByLabel('Product name')).toBeVisible();
  await rail.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByLabel('Your name')).toBeVisible();

  // ⌘K → "Settings" nav entry.
  await page.goto('/app/board');
  await expect(page.getByTestId('column-now')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByPlaceholder(/type a command or search/i);
  await input.fill('settings');
  await page.getByRole('option', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/settings\/templates$/);
});

test('AC2+AC3: template create/edit/set-default/duplicate/archive and the new-doc dialog', async ({
  page,
  request,
}) => {
  await page.goto('/app/settings/templates');
  const prdSection = page.locator('section[aria-label="prd templates"]');
  await expect(prdSection.getByText('Product requirements (PRD)')).toBeVisible();

  // Create "Lightweight PRD" under the PRD group → lands in the editor.
  await prdSection.getByRole('button', { name: 'New template' }).click();
  await prdSection.getByLabel('New prd template name').fill('Lightweight PRD');
  await prdSection.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/app\/settings\/templates\/[0-9a-f-]+$/);
  await expect(page.getByLabel('Name')).toHaveValue('Lightweight PRD');

  // Description saves on blur.
  await page.getByLabel('Description').fill('One-pager for small bets');
  await page.getByLabel('Description').blur();

  // Body edits in the same Tiptap chrome as docs — slash menu included.
  const body = page.locator('[aria-label="Document body"]');
  await body.click();
  await page.keyboard.type('/head');
  await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
  await page.keyboard.press('Enter'); // Heading 1
  await page.keyboard.type('{{title}}');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Problem worth one page.');
  await expect(body.getByRole('heading', { name: '{{title}}' })).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Back in the manager (the chrome bar's back link; the nav gear shares the
  // same accessible name, so navigate directly): set it as the PRD default.
  await page.goto('/app/settings/templates');
  const lightweightRow = page
    .getByTestId('template-row')
    .filter({ hasText: 'Lightweight PRD' })
    .first();
  await lightweightRow.getByRole('button', { name: 'Actions for Lightweight PRD' }).click();
  await page.getByRole('menuitem', { name: 'Set default' }).click();
  await expect(lightweightRow.getByText('Default', { exact: true })).toBeVisible();
  // The built-in PRD template lost its pill.
  const builtinRow = page
    .getByTestId('template-row')
    .filter({ hasText: 'Product requirements (PRD)' });
  await expect(builtinRow.getByText('Default', { exact: true })).toHaveCount(0);

  // AC3 — archiving the current default is blocked with a clear error.
  await lightweightRow.getByRole('button', { name: 'Actions for Lightweight PRD' }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await expect(page.getByText(/set another default/i)).toBeVisible();
  await expect(lightweightRow).toBeVisible(); // still active

  // AC3 — duplicate, then archive the copy; it moves under the Archived toggle.
  await lightweightRow.getByRole('button', { name: 'Actions for Lightweight PRD' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  const copyRow = page.getByTestId('template-row').filter({ hasText: 'Lightweight PRD copy' });
  await expect(copyRow).toBeVisible();
  await copyRow.getByRole('button', { name: 'Actions for Lightweight PRD copy' }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await expect(copyRow).toHaveCount(0);
  await page.getByRole('button', { name: /^Archived \(/ }).click();
  await expect(
    page.getByTestId('archived-template-row').filter({ hasText: 'Lightweight PRD copy' }),
  ).toBeVisible();

  // AC2 — new-doc dialog lists both PRD templates, new default preselected;
  // AC3 — the archived copy is hidden.
  const feature = await getFeatureByTitle(request, FEATURE_TITLE);
  await page.goto(`/app/board?feature=${feature.id}`);
  await page.getByRole('button', { name: 'New doc' }).click();
  const dialog = page.getByRole('dialog', { name: 'New doc' });
  await expect(dialog).toBeVisible();
  const lightweightRadio = dialog.getByRole('radio', { name: /Lightweight PRD/ });
  await expect(lightweightRadio).toBeChecked(); // default first + preselected
  await expect(dialog.getByRole('radio', { name: /Product requirements/ })).toBeVisible();
  await expect(dialog.getByText('Lightweight PRD copy')).toHaveCount(0);
  await expect(dialog.getByRole('radio', { name: /Blank/ })).toBeVisible();

  // Create a doc from it: body copied with {{title}} replaced.
  const title = 'Lightweight settings e2e PRD';
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/app\/docs\//);
  const docBody = page.locator('[aria-label="Document body"]');
  await expect(docBody.getByRole('heading', { name: title })).toBeVisible();
  await expect(docBody.getByText('Problem worth one page.')).toBeVisible();
  await expect(docBody.getByText('{{title}}')).toHaveCount(0);
});

test('AC4: vision edits reflect on the landing page and export downloads', async ({ page }) => {
  await page.goto('/app/settings/workspace');
  const vision = page.getByLabel('Vision');
  await expect(vision).toHaveValue(SEED_VISION);
  await vision.fill('Ship roadmaps your auditors actually like.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Workspace saved')).toBeVisible();

  await page.goto('/app/p/productmap');
  await expect(page.getByText('Ship roadmaps your auditors actually like.')).toBeVisible();

  // Export downloads the zip.
  await page.goto('/app/settings/workspace');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export workspace' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

test('AC5: profile rename + avatar color reflect on feature-page avatars', async ({
  page,
  request,
}) => {
  // Attribute a fresh feature to "me" so the People rail shows my avatar.
  await page.goto('/app/board');
  const later = page.getByTestId('column-later');
  await later.getByRole('button', { name: 'Add feature' }).click();
  await page.getByLabel('Title').fill('Settings avatar feature');
  await page.getByRole('button', { name: 'Create' }).click();
  await later.getByRole('button', { name: 'Settings avatar feature', exact: true }).click();
  await page.getByRole('button', { name: /Open feature/ }).click();
  await expect(page).toHaveURL(/\/app\/features\//);
  const featureUrl = page.url();

  // Rename + recolor in the profile tab.
  await page.goto('/app/settings/profile');
  const nameInput = page.getByLabel('Your name');
  await nameInput.fill('Quinn Renamed');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Name updated')).toBeVisible();
  const color = '#9a6428'; // USER_COLORS[2]
  await page.getByRole('button', { name: `Use color ${color}` }).click();
  await expect(page.getByRole('button', { name: `Use color ${color}` })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Live preview avatar reflects both.
  const preview = page.getByLabel('Avatar preview').getByLabel('Quinn Renamed');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveCSS('background-color', 'rgb(154, 100, 40)');

  // Feature page People rail + activity show the renamed, recolored avatar.
  await page.goto(featureUrl);
  const people = page.locator('section[aria-label="People"]');
  const avatar = people.getByLabel('Quinn Renamed').first();
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveCSS('background-color', 'rgb(154, 100, 40)');
  await expect(
    page.locator('section[aria-label="Activity"]').getByText('Quinn Renamed').first(),
  ).toBeVisible();

  // API agrees (avatars elsewhere render from the same user record).
  const users = (await (await request.get('/api/users')).json()) as {
    name: string;
    color: string;
  }[];
  expect(users.some((u) => u.name === 'Quinn Renamed' && u.color === color)).toBe(true);
});

test('AC6 (negative): with AI status disabled no AI affordances render', async ({
  page,
  request,
}) => {
  const feature = await getFeatureByTitle(request, FEATURE_TITLE);
  const doc = await createDocument(request, {
    featureId: feature.id,
    type: 'prd',
    title: 'Settings AI-off doc',
    fromTemplate: false,
  });

  await page.route('**/api/ai/status', (route) => route.fulfill({ json: { enabled: false } }));

  // Empty doc: no draft card, no Draft with AI button.
  await page.goto(`/app/docs/${doc.id}`);
  await expect(page.locator('[aria-label="Document body"]')).toBeVisible();
  await expect(page.getByText('Draft this document with AI')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Draft with AI' })).toHaveCount(0);

  // Overview: AI digest card hidden.
  await page.goto('/app/p/productmap');
  await expect(page.getByRole('heading', { level: 1, name: 'ProductMap' })).toBeVisible();
  await expect(page.locator('[data-testid="ai-digest-card"]')).toHaveCount(0);
});

test('AC4: reset-demo is confirm-gated and restores the seed', async ({ page, request }) => {
  await page.goto('/app/settings/workspace');
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  const confirm = page.getByRole('dialog', { name: 'Reset demo data?' });
  await expect(confirm).toBeVisible();

  // Cancel does nothing.
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  let users = (await (await request.get('/api/users')).json()) as { name: string }[];
  expect(users.some((u) => u.name === 'Quinn Renamed')).toBe(true);

  // Confirm → seed restored.
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await confirm.getByRole('button', { name: 'Yes, reset everything' }).click();
  await expect(page.getByText('Demo data reset — workspace restored to the seed')).toBeVisible();

  // Resolve pid AFTER reset-demo, which mints a new project row.
  const pid = await getProjectId(request);
  const overview = (await (await request.get(`/api/projects/${pid}/overview`)).json()) as {
    project: { vision: string };
  };
  expect(overview.project.vision).toBe(SEED_VISION);

  users = (await (await request.get('/api/users')).json()) as { name: string }[];
  expect(users.map((u) => u.name)).toEqual([
    'Corban',
    'Priya Shah',
    'Marcus Webb',
    'Elena Rodriguez',
  ]);

  const templates = (await (
    await request.get('/api/templates?includeArchived=true')
  ).json()) as { name: string }[];
  // Seed ships 6 templates: the 4 feature doc types + Idea pitch + Release notes.
  expect(templates).toHaveLength(6);
  expect(templates.some((t) => t.name === 'Lightweight PRD')).toBe(false);
});

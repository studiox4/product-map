# E5 — Public Idea Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone, without logging in, submit an idea through a per-project public form that lands (optionally held for moderation) in that project's idea inbox.

**Architecture:** Reuse the E1 `share_tokens` machinery with a new `kind='intake'` token carrying a per-token `config jsonb` (`{introMd, moderation}`). A new public, unauthenticated `/api/intake` sub-app serves form metadata (GET) and accepts submissions (POST). Submissions create `ideas` rows (`source='public'`, status `pending` when moderated, else `inbox`) and fan out an `idea_submitted` in-app notification to project owners/editors. A bare public React page at `/p/:token/submit` renders the form.

**Tech Stack:** Hono + Drizzle (Postgres) API, Zod validation, React + React Query + Tailwind web, Vitest tests.

## Global Constraints

- Work entirely in the worktree `/Users/corbanbaxter/Development/product-map/.claude/worktrees/e5-public-intake` (branch `e5-public-intake`).
- TDD: write the failing test first, watch it fail, implement, watch it pass, commit.
- API/web tests need Postgres; the sandbox blocks it — run test/db commands with the sandbox disabled (`dangerouslyDisableSandbox: true`).
- **Security invariants (non-negotiable, from the #23 review):**
  1. The submit `POST /api/intake/:token` independently re-validates the token (`revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now)` AND `kind='intake'`) before any insert — same opaque 404 as the meta GET. Never trust that a form was loaded.
  2. Moderation fails closed: absent/null token config ⇒ treat as `moderation=true` (held).
  3. `projectId` always comes from the token row, never from the client.
  4. `submitterName`/`submitterEmail` are unauthenticated PII — never serialized on any public/share payload. The meta GET returns no ideas and no contact.
  5. `pending` ideas are excluded from every default (all-status) idea read; only an explicit `?status=pending` surfaces them.
- Opaque 404 (`{ error: 'not_found' }`) for unknown/revoked/expired/wrong-kind tokens — no enumeration leak.
- Rate-limit `RateLimiter` is per-process (best-effort on multi-instance Railway) — acceptable for v1; do not claim a hard global cap.
- Commit message trailer on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XhNkajkFHnMkWCGGGYVM31
  ```

## File Structure

**Create:**
- `apps/api/src/routes/intake.ts` — public intake sub-app (meta GET + submit POST) + nested mint route export.
- `apps/api/src/routes/intake.test.ts` — API tests for mint, meta, submit, moderation, honeypot, rate-limit, scoping, notification.
- `apps/web/src/routes/IntakePage.tsx` — bare public form page.
- `apps/web/src/routes/IntakePage.test.tsx` — web tests for the form/states/noindex/honeypot.
- `apps/web/src/components/settings/IntakeBlock.tsx` — settings UI to mint/revoke/configure the intake link.
- `apps/web/src/components/settings/IntakeBlock.test.tsx` — web tests for mint/revoke/config.

**Modify:**
- `packages/shared/src/constants.ts` — add `pending` to `IDEA_STATUSES`; add `IDEA_INBOX_STATUSES`; add `idea_submitted` to `NOTIFICATION_KINDS`.
- `packages/shared/src/constants.test.ts` — update the exact-array assertions.
- `packages/shared/src/schemas.ts` — add `intakeMint` + `intakeSubmit` zod schemas.
- `packages/shared/src/api-types.ts` — add `IntakeConfig`, `IntakeMintResult`, `IntakeMeta` types.
- `packages/db/src/schema.ts` — `ideaStatusEnum` add `pending`; `ideas` add `submitterName`/`submitterEmail`; `share_tokens` add `config jsonb`; `NOTIFICATION_KIND_VALUES` add `idea_submitted`.
- `packages/db/migrations/*` — generated migration + meta (hand-verify the kind CHECK + enum ADD VALUE).
- `apps/web/src/demo/demo-runtime.test.ts` — bump the expected migration count.
- `apps/api/src/routes/ideas.ts` — default list query excludes `pending`.
- `apps/api/src/lib/notifications.ts` — add `fanOutIdeaSubmittedNotification`.
- `apps/api/src/routes/share.ts` — add `.post('/intake')` to `shareMintRoutes`.
- `apps/api/src/app.ts` — mount `publicIntakeRoutes` at `/api/intake`; add `/api/intake/*` (GET+POST) to the public allowlist.
- `apps/web/src/lib/api.ts` — add `useCreateIntake`, `useIntakeMeta`, `useSubmitIntake`; reuse `useRevokeShare` + `useIdeas`/`useUpdateIdea`.
- `apps/web/src/App.tsx` — add the `/p/:token/submit` public route.
- `apps/web/src/routes/Inbox.tsx` — add a "Pending review" filter tab + approve/reject buttons.
- `apps/web/src/components/notifications/NotificationPanel.tsx` — add the `idea_submitted` summary + link case.

---

### Task 1: Shared constants, schemas, and types

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/constants.test.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/api-types.ts`
- Test: `packages/shared/src/constants.test.ts`

**Interfaces:**
- Produces:
  - `IDEA_STATUSES = ['inbox','triaged','promoted','archived','pending']`, `type IdeaStatus`.
  - `IDEA_INBOX_STATUSES = ['inbox','triaged','promoted','archived']` (the default-list set; `IDEA_STATUSES` minus `pending`).
  - `NOTIFICATION_KINDS = ['mention','comment','reply','project_invite','idea_submitted']`.
  - `intakeMint` zod: `{ introMd: string(max 2000, default ''), moderation: boolean(default true), expiresInDays: 7|30|90|null (default null) }`.
  - `intakeSubmit` zod: `{ title: string min1 max200, bodyMd: string max5000 default '', submitterName: string max100 optional, submitterEmail: string email max200 optional, website: string max0 default '' }` (honeypot must be empty).
  - `IntakeConfig = { introMd: string; moderation: boolean }`.
  - `IntakeMintResult = { url: string; expiresAt: string | null }`.
  - `IntakeMeta = { projectName: string; introMd: string; active: true }`.

- [ ] **Step 1: Write the failing test** — update `packages/shared/src/constants.test.ts`

```typescript
// in the existing NOTIFICATION_KINDS describe block, replace the toEqual assertion:
expect(NOTIFICATION_KINDS).toEqual(['mention', 'comment', 'reply', 'project_invite', 'idea_submitted']);

// add a new describe block:
describe('IDEA_STATUSES', () => {
  it('includes pending and exposes the inbox subset without it', () => {
    expect(IDEA_STATUSES).toEqual(['inbox', 'triaged', 'promoted', 'archived', 'pending']);
    expect(IDEA_INBOX_STATUSES).toEqual(['inbox', 'triaged', 'promoted', 'archived']);
    expect(IDEA_INBOX_STATUSES).not.toContain('pending');
  });
});
```
Add `IDEA_STATUSES, IDEA_INBOX_STATUSES, NOTIFICATION_KINDS` to the test's import from `./constants`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/shared test -- constants`
Expected: FAIL — `IDEA_INBOX_STATUSES` undefined / array mismatch.

- [ ] **Step 3: Implement the constants** — `packages/shared/src/constants.ts`

```typescript
// replace the IDEA_STATUSES line (was: ['inbox', 'triaged', 'promoted', 'archived']):
export const IDEA_STATUSES = ['inbox', 'triaged', 'promoted', 'archived', 'pending'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];
/** Statuses shown in the default (no-filter) inbox list — everything except held public submissions. */
export const IDEA_INBOX_STATUSES = IDEA_STATUSES.filter((s) => s !== 'pending') as readonly Exclude<
  IdeaStatus,
  'pending'
>[];

// replace the NOTIFICATION_KINDS line:
export const NOTIFICATION_KINDS = ['mention', 'comment', 'reply', 'project_invite', 'idea_submitted'] as const;
```

- [ ] **Step 4: Add the schemas** — `packages/shared/src/schemas.ts` (after the `shareMint` block ~line 264)

```typescript
// --- E5 public idea intake ---
export const intakeMint = z.object({
  introMd: z.string().max(2000).default(''),
  moderation: z.boolean().default(true),
  expiresInDays: z
    .union([z.literal(7), z.literal(30), z.literal(90)])
    .nullable()
    .default(null),
});
export const intakeSubmit = z.object({
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(5000).default(''),
  submitterName: z.string().max(100).optional(),
  submitterEmail: z.string().email().max(200).optional(),
  // Honeypot: real users never see this; bots fill it. Must be empty.
  website: z.string().max(0).default(''),
});
```

- [ ] **Step 5: Add the types** — `packages/shared/src/api-types.ts` (near `ShareMintResult`)

```typescript
export interface IntakeConfig {
  introMd: string;
  moderation: boolean;
}
export interface IntakeMintResult {
  url: string;
  expiresAt: string | null;
}
export interface IntakeMeta {
  projectName: string;
  introMd: string;
  active: true;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @productmap/shared test`
Expected: PASS (all shared tests, including the updated constants test).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/constants.test.ts packages/shared/src/schemas.ts packages/shared/src/api-types.ts
git commit -m "feat(E5): shared constants, schemas, types for public intake"
```

---

### Task 2: DB schema + migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/migrations/00NN_*.sql` (generated) + `packages/db/migrations/meta/*` (generated)
- Modify: `apps/web/src/demo/demo-runtime.test.ts`

**Interfaces:**
- Consumes: `IntakeConfig` (Task 1).
- Produces: `ideas.submitterName`, `ideas.submitterEmail` columns; `ideaStatusEnum` value `pending`; `share_tokens.config` jsonb column typed `IntakeConfig`; `notifications`/`notification_mutes` kind CHECK allowing `idea_submitted`.

- [ ] **Step 1: Edit the schema** — `packages/db/src/schema.ts`

```typescript
// 1. ideaStatusEnum (~line 24) — add 'pending':
export const ideaStatusEnum = pgEnum('idea_status', ['inbox', 'triaged', 'promoted', 'archived', 'pending']);

// 2. NOTIFICATION_KIND_VALUES (~line 166) — add 'idea_submitted':
const NOTIFICATION_KIND_VALUES = ['mention', 'comment', 'reply', 'project_invite', 'idea_submitted'] as const;

// 3. ideas table (~line 237) — add contact columns after `source`:
  submitterName: text('submitter_name'),
  submitterEmail: text('submitter_email'),

// 4. share_tokens table (~line 351, after expiresAt) — add intake config:
  // Intake-token config (E5). Null for roadmap tokens. Read paths key off `kind`.
  config: jsonb('config').$type<IntakeConfig>(),
```
Add `import type { IntakeConfig } from '@productmap/shared';` if not already imported (check the schema's import block; if importing types from shared is not the existing pattern, inline the type: `.$type<{ introMd: string; moderation: boolean }>()`).

- [ ] **Step 2: Generate the migration**

Run (sandbox disabled): `pnpm --filter @productmap/db generate`
Expected: a new `packages/db/migrations/00NN_*.sql` + updated `meta/_journal.json` + snapshot.

- [ ] **Step 3: Verify & hand-fix the generated SQL**

Open the new `.sql`. Confirm it contains, in this spirit:
```sql
ALTER TYPE "public"."idea_status" ADD VALUE 'pending';--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "submitter_name" text;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "submitter_email" text;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD COLUMN "config" jsonb;
```
drizzle-kit may NOT regenerate the raw-SQL `notifications_kind_check` / `notification_mutes_kind_check` constraints. If the new kind is absent from them, append by hand:
```sql
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" IN ('mention', 'comment', 'reply', 'project_invite', 'idea_submitted'));--> statement-breakpoint
ALTER TABLE "notification_mutes" DROP CONSTRAINT "notification_mutes_kind_check";--> statement-breakpoint
ALTER TABLE "notification_mutes" ADD CONSTRAINT "notification_mutes_kind_check" CHECK ("notification_mutes"."kind" IN ('mention', 'comment', 'reply', 'project_invite', 'idea_submitted'));
```
(Constraint names: confirm against an earlier migration that created them; match exactly.)

- [ ] **Step 4: Apply the migration to the test DB**

Run (sandbox disabled): `pnpm --filter @productmap/db migrate`
Expected: migration applies without error.

- [ ] **Step 5: Bump the demo migration count**

In `apps/web/src/demo/demo-runtime.test.ts`, find the exact-count assertion (currently expects the prior count, e.g. `19`) and increment by 1.

- [ ] **Step 6: Verify schema typechecks**

Run (sandbox disabled): `pnpm --filter @productmap/db exec tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations apps/web/src/demo/demo-runtime.test.ts
git commit -m "feat(E5): migration — pending idea status, intake config, submitter contact, idea_submitted notif kind"
```

---

### Task 3: Exclude `pending` from the default idea list

**Files:**
- Modify: `apps/api/src/routes/ideas.ts:142-168` (the `.get('/')` handler)
- Test: `apps/api/src/routes/ideas.test.ts`

**Interfaces:**
- Consumes: `IDEA_INBOX_STATUSES` (Task 1), `pending` status (Task 2).
- Produces: default `GET /api/projects/:id/ideas` returns only `IDEA_INBOX_STATUSES`; `?status=pending` returns held ideas.

- [ ] **Step 1: Write the failing test** — append to `ideas.test.ts`

```typescript
it('excludes pending ideas from the default list but returns them under ?status=pending', async () => {
  // Insert a held public submission directly.
  const [held] = await db
    .insert(ideas)
    .values({ projectId, title: 'Held idea', source: 'public', status: 'pending' })
    .returning();

  const def = await app.request(`/api/projects/${projectId}/ideas`, { headers: auth });
  const defList = await def.json();
  expect((defList as Array<{ id: string }>).map((r) => r.id)).not.toContain(held.id);

  const pend = await app.request(`/api/projects/${projectId}/ideas?status=pending`, { headers: auth });
  const pendList = await pend.json();
  expect((pendList as Array<{ id: string }>).map((r) => r.id)).toEqual([held.id]);
});
```
Ensure `ideas` is in the test's destructured `@productmap/db` import (it is).

- [ ] **Step 2: Run test to verify it fails**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- ideas`
Expected: FAIL — held idea appears in the default list.

- [ ] **Step 3: Implement the exclusion** — `ideas.ts` `.get('/')` WHERE clause

```typescript
// add IDEA_INBOX_STATUSES to the shared import at top of ideas.ts.
// replace the .where(...) in the list query:
      .where(
        status
          ? and(eq(ideas.projectId, pid), eq(ideas.status, status as (typeof IDEA_STATUSES)[number]))
          : and(eq(ideas.projectId, pid), inArray(ideas.status, IDEA_INBOX_STATUSES as unknown as IdeaStatus[])),
      )
```
`inArray` is already imported in `ideas.ts`. Add `IdeaStatus` to the shared type import if needed for the cast.

- [ ] **Step 4: Run test to verify it passes**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- ideas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/ideas.ts apps/api/src/routes/ideas.test.ts
git commit -m "feat(E5): exclude pending ideas from the default inbox list"
```

---

### Task 4: `idea_submitted` notification fan-out helper

**Files:**
- Modify: `apps/api/src/lib/notifications.ts`
- Test: `apps/api/src/routes/intake.test.ts` (created here; covers the helper via the route in Task 5) — for this task add a focused unit test in a new `apps/api/src/lib/notifications.test.ts` if none exists, else co-locate.

**Interfaces:**
- Consumes: `idea_submitted` kind (Tasks 1–2), `memberships` roles `owner`/`editor`.
- Produces: `export async function fanOutIdeaSubmittedNotification(params: { projectId: string; ideaId: string; title: string }): Promise<void>` — inserts one `idea_submitted` notification per owner/editor (minus muted), `actorId=null`, `payload={ideaId,title}`. Best-effort (try/catch, swallow+log).

- [ ] **Step 1: Write the failing test** — `apps/api/src/lib/notifications.test.ts` (create if absent; mirror ideas.test.ts setup helpers)

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject, addMembership } from '../test/helpers';

const { db } = await import('../db');
const { notifications, ideas } = await import('@productmap/db');
const { fanOutIdeaSubmittedNotification } = await import('./notifications');

beforeAll(async () => { await setupTestDb(); });
beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await closeTestDb(); });

it('notifies owners and editors (not viewers) of a held submission', async () => {
  const project = await createTestProject('P');
  const owner = await createTestUser({ role: 'member', name: 'O', email: 'o@t.co' });
  const editor = await createTestUser({ role: 'member', name: 'E', email: 'e@t.co' });
  const viewer = await createTestUser({ role: 'member', name: 'V', email: 'v@t.co' });
  await addMembership(owner.id, project.id, 'owner');
  await addMembership(editor.id, project.id, 'editor');
  await addMembership(viewer.id, project.id, 'viewer');
  const [idea] = await db.insert(ideas).values({ projectId: project.id, title: 'X', source: 'public', status: 'pending' }).returning();

  await fanOutIdeaSubmittedNotification({ projectId: project.id, ideaId: idea.id, title: 'X' });

  const rows = await db.select().from(notifications).where(eq(notifications.projectId, project.id));
  const recipientIds = rows.map((r) => r.userId).sort();
  expect(recipientIds).toEqual([owner.id, editor.id].sort());
  expect(rows.every((r) => r.kind === 'idea_submitted')).toBe(true);
  expect(rows.every((r) => r.actorId === null)).toBe(true);
  expect(rows[0].payload).toMatchObject({ ideaId: idea.id, title: 'X' });
});
```
(Confirm `createTestUser`'s `role` field — it is the global user role; project role is set via `addMembership`. Adjust the `role` value to whatever `helpers.ts` accepts for a normal user.)

- [ ] **Step 2: Run test to verify it fails**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- notifications`
Expected: FAIL — `fanOutIdeaSubmittedNotification` is not exported.

- [ ] **Step 3: Implement the helper** — append to `notifications.ts`

```typescript
/**
 * Notify project owners + editors that a public idea was submitted (held for
 * moderation). actorId is null — the submitter is unauthenticated. Best-effort;
 * a failure here must never fail the public submit.
 */
export async function fanOutIdeaSubmittedNotification(
  params: { projectId: string; ideaId: string; title: string },
): Promise<void> {
  try {
    const recipients = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.projectId, params.projectId), inArray(memberships.role, ['owner', 'editor'])));
    const ids = recipients.map((r) => r.userId);
    if (ids.length === 0) return;
    const muted = await mutedAmong(ids, 'idea_submitted');
    const rows = ids
      .filter((id) => !muted.has(id))
      .map((id) => ({
        userId: id,
        projectId: params.projectId,
        kind: 'idea_submitted' as const,
        actorId: null,
        payload: { ideaId: params.ideaId, title: params.title },
      }));
    if (rows.length > 0) await db.insert(notifications).values(rows);
  } catch (err) {
    console.error('[notifications] idea_submitted fan-out failed (swallowed):', { projectId: params.projectId, ideaId: params.ideaId }, err);
  }
}
```
(`memberships`, `inArray`, `mutedAmong`, `notifications`, `db`, `and`, `eq` are all already imported in `notifications.ts`.)

- [ ] **Step 4: Run test to verify it passes**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- notifications`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/notifications.ts apps/api/src/lib/notifications.test.ts
git commit -m "feat(E5): idea_submitted notification fan-out to owners/editors"
```

---

### Task 5: Mint intake token route

**Files:**
- Modify: `apps/api/src/routes/share.ts` (`shareMintRoutes`, add `.post('/intake')`)
- Test: `apps/api/src/routes/intake.test.ts` (created; mint section)

**Interfaces:**
- Consumes: `intakeMint` (Task 1), `share_tokens.config` (Task 2).
- Produces: `POST /api/projects/:projectId/share/intake` → 201 `IntakeMintResult` `{ url: '/p/<token>/submit', expiresAt }`; editor-gated by the existing method gate; non-editor → 403.

- [ ] **Step 1: Write the failing test** — `apps/api/src/routes/intake.test.ts` (use the ideas.test.ts setup harness: imports, beforeAll/beforeEach/afterAll, `json()` helper, `addMembership`)

```typescript
it('editor mints an intake link; returns the /p/<token>/submit url', async () => {
  const res = await app.request(`/api/projects/${projectId}/share/intake`, json({ introMd: 'Tell us your idea', moderation: true }));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.url).toMatch(/^\/p\/[A-Za-z0-9_-]{10,}\/submit$/);
  expect(body.expiresAt).toBeNull();
});

it('viewer cannot mint an intake link → 403', async () => {
  const viewer = await createTestUser({ role: 'member', name: 'V', email: 'v@t.co' });
  await addMembership(viewer.id, projectId, 'viewer');
  const vauth = { cookie: await authCookie(viewer), origin: 'http://localhost', host: 'localhost' };
  const res = await app.request(`/api/projects/${projectId}/share/intake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...vauth },
    body: JSON.stringify({ introMd: '', moderation: true }),
  });
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- intake`
Expected: FAIL — 404 (route absent).

- [ ] **Step 3: Implement the mint route** — add to `shareMintRoutes` in `share.ts` (after `.post('/roadmap', ...)`); add `intakeMint` to the `@productmap/shared` import

```typescript
  // POST /api/projects/:projectId/share/intake → mint a public idea-intake link.
  .post('/intake', async (c) => {
    const bodyText = await c.req.text();
    let raw: unknown = {};
    if (bodyText.trim() !== '') {
      try {
        raw = JSON.parse(bodyText);
      } catch {
        return c.json({ error: 'bad_request', issues: [{ message: 'Invalid JSON body' }] }, 400);
      }
    }
    const parsed = intakeMint.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
    }
    const { introMd, moderation, expiresInDays } = parsed.data;
    const token = nanoid();
    const projectId = c.get('currentProjectId');
    const expiresAt =
      expiresInDays != null ? new Date(Date.now() + expiresInDays * 86_400_000) : null;
    await db.insert(shareTokens).values({
      projectId,
      token,
      kind: 'intake',
      config: { introMd, moderation },
      expiresAt,
    });
    return c.json({ url: `/p/${token}/submit`, expiresAt: expiresAt?.toISOString() ?? null }, 201);
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- intake`
Expected: PASS (mint tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/share.ts apps/api/src/routes/intake.test.ts
git commit -m "feat(E5): mint intake share token (editor-gated)"
```

---

### Task 6: Public intake routes (meta GET + submit POST) + app mount

**Files:**
- Create: `apps/api/src/routes/intake.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/intake.test.ts`

**Interfaces:**
- Consumes: `intakeSubmit` (Task 1), `share_tokens.config`/`kind` (Task 2), `fanOutIdeaSubmittedNotification` (Task 4), `RateLimiter`/`clientIp` (`../lib/rate-limit`).
- Produces:
  - `GET /api/intake/:token` → 200 `IntakeMeta` or opaque 404.
  - `POST /api/intake/:token` → 201 `{ ok: true }`; 404 (revoked/expired/wrong-kind/unknown); 400 (validation); 429 (rate-limited). Inserts an idea; fans out notification when held.
  - `export const publicIntakeRoutes`.

- [ ] **Step 1: Write the failing tests** — append to `intake.test.ts`

```typescript
// Helper to mint + extract token (uses the Task 5 route):
async function mintIntake(over: Record<string, unknown> = {}) {
  const res = await app.request(`/api/projects/${projectId}/share/intake`, json({ introMd: 'hi', moderation: true, ...over }));
  expect(res.status).toBe(201);
  return (await res.json()).url.split('/')[2] as string; // /p/<token>/submit
}
const submit = (token: string, body: unknown) =>
  app.request(`/api/intake/${token}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost' }, body: JSON.stringify(body) });

it('meta GET returns project name + intro for an active intake token', async () => {
  const token = await mintIntake({ introMd: 'Share your idea' });
  const res = await app.request(`/api/intake/${token}`);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ projectName: 'ProductMap', introMd: 'Share your idea', active: true });
});

it('meta GET on a revoked token → opaque 404', async () => {
  const token = await mintIntake();
  await db.update(shareTokens).set({ revokedAt: new Date() }).where(eq(shareTokens.token, token));
  const res = await app.request(`/api/intake/${token}`);
  expect(res.status).toBe(404);
});

it('held submission creates a pending public idea + notifies owners/editors', async () => {
  const token = await mintIntake({ moderation: true });
  const res = await submit(token, { title: 'CSV export', bodyMd: 'please', submitterEmail: 'a@b.co' });
  expect(res.status).toBe(201);
  const rows = await db.select().from(ideas).where(eq(ideas.projectId, projectId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: 'pending', source: 'public', submitterEmail: 'a@b.co', createdBy: null });
  const notifs = await db.select().from(notifications).where(eq(notifications.projectId, projectId));
  expect(notifs.some((n) => n.kind === 'idea_submitted')).toBe(true);
});

it('moderation-off submission lands straight in the inbox, no held notification', async () => {
  const token = await mintIntake({ moderation: false });
  await submit(token, { title: 'Quick idea' });
  const [row] = await db.select().from(ideas).where(eq(ideas.projectId, projectId));
  expect(row.status).toBe('inbox');
  const notifs = await db.select().from(notifications).where(eq(notifications.projectId, projectId));
  expect(notifs.some((n) => n.kind === 'idea_submitted')).toBe(false);
});

it('submit re-validates the token: revoked → 404 even with a valid body', async () => {
  const token = await mintIntake();
  await db.update(shareTokens).set({ revokedAt: new Date() }).where(eq(shareTokens.token, token));
  const res = await submit(token, { title: 'Should not save' });
  expect(res.status).toBe(404);
  const rows = await db.select().from(ideas).where(eq(ideas.projectId, projectId));
  expect(rows).toHaveLength(0);
});

it('honeypot: a filled website field → 201 but no idea saved', async () => {
  const token = await mintIntake();
  const res = await submit(token, { title: 'Bot', website: 'http://spam' });
  expect(res.status).toBe(201);
  const rows = await db.select().from(ideas).where(eq(ideas.projectId, projectId));
  expect(rows).toHaveLength(0);
});

it('a roadmap token cannot be used as an intake token → 404', async () => {
  const mint = await app.request(`/api/projects/${projectId}/share/roadmap`, json({}));
  const roadmapToken = (await mint.json()).url.split('/').pop();
  const res = await submit(roadmapToken, { title: 'wrong kind' });
  expect(res.status).toBe(404);
});
```
Add `shareTokens`, `notifications` to the test's `@productmap/db` destructured import.

- [ ] **Step 2: Run tests to verify they fail**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- intake`
Expected: FAIL — meta/submit routes absent.

- [ ] **Step 3: Implement `intake.ts`**

```typescript
// Public, unauthenticated idea-intake endpoints (E5).
//   GET  /api/intake/:token  — form metadata (project name + intro). Opaque 404.
//   POST /api/intake/:token  — accept a public submission. Re-validates the token.
import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { projects, shareTokens, ideas } from '@productmap/db/schema';
import type { AuthEnv } from '../middleware/auth';
import type { IntakeConfig } from '@productmap/shared';
import { intakeSubmit } from '@productmap/shared';
import { RateLimiter, clientIp } from '../lib/rate-limit';
import { fanOutIdeaSubmittedNotification } from '../lib/notifications';

// Per-process limiters (best-effort on multi-instance Railway).
const ipLimiter = new RateLimiter({ max: 5, windowMs: 60_000 });
const tokenLimiter = new RateLimiter({ max: 20, windowMs: 3_600_000 });

/** Load an active (non-revoked, non-expired) intake token, or null. */
async function loadActiveIntakeToken(token: string) {
  const [row] = await db
    .select()
    .from(shareTokens)
    .where(and(eq(shareTokens.token, token), isNull(shareTokens.revokedAt)));
  if (!row) return null;
  if (row.kind !== 'intake') return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

export const publicIntakeRoutes = new Hono<AuthEnv>()
  .get('/:token', async (c) => {
    const row = await loadActiveIntakeToken(c.req.param('token'));
    if (!row) return c.json({ error: 'not_found' }, 404);
    const [project] = await db.select().from(projects).where(eq(projects.id, row.projectId));
    if (!project) return c.json({ error: 'not_found' }, 404);
    // Fail-closed default handled at submit; meta only needs intro copy.
    const config = (row.config as IntakeConfig | null) ?? { introMd: '', moderation: true };
    return c.json({ projectName: project.name, introMd: config.introMd, active: true });
  })
  .post('/:token', async (c) => {
    // Invariant 1: the POST re-validates the token — never trust a loaded form.
    const row = await loadActiveIntakeToken(c.req.param('token'));
    if (!row) return c.json({ error: 'not_found' }, 404);

    // Rate-limit per-IP and per-token.
    const ip = await clientIp(c);
    if (!ipLimiter.hit(`intake:ip:${ip}`)) return c.json({ error: 'rate_limited' }, 429);
    if (!tokenLimiter.hit(`intake:tok:${row.token}`)) return c.json({ error: 'rate_limited' }, 429);

    const bodyText = await c.req.text();
    let raw: unknown = {};
    if (bodyText.trim() !== '') {
      try {
        raw = JSON.parse(bodyText);
      } catch {
        return c.json({ error: 'bad_request', issues: [{ message: 'Invalid JSON body' }] }, 400);
      }
    }
    const parsed = intakeSubmit.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
    const { title, bodyMd, submitterName, submitterEmail, website } = parsed.data;

    // Honeypot: pretend success, drop silently.
    if (website !== '') return c.json({ ok: true }, 201);

    // Invariant 2: fail closed — absent config ⇒ moderated.
    const config = (row.config as IntakeConfig | null) ?? { introMd: '', moderation: true };
    const status = config.moderation ? ('pending' as const) : ('inbox' as const);

    const [idea] = await db
      .insert(ideas)
      // Invariant 3: projectId from the token, never the client.
      .values({
        projectId: row.projectId,
        title,
        bodyMd,
        source: 'public',
        status,
        submitterName: submitterName ?? null,
        submitterEmail: submitterEmail ?? null,
        createdBy: null,
      })
      .returning();

    if (status === 'pending') {
      await fanOutIdeaSubmittedNotification({ projectId: row.projectId, ideaId: idea.id, title: idea.title });
    }
    // Invariant 4: opaque success — no idea id, no PII echoed.
    return c.json({ ok: true }, 201);
  });
```

- [ ] **Step 4: Mount + allowlist** — `app.ts`

```typescript
// import alongside publicShareRoutes:
import { publicIntakeRoutes } from './routes/intake';

// in the public allowlist (the isPublic expression), add the intake clause:
      (p.startsWith('/api/share/') && c.req.method === 'GET') ||
      p.startsWith('/api/intake/');

// mount alongside the share route:
  .route('/api/intake', publicIntakeRoutes)
```
Note: `/api/intake/` covers both the GET meta and POST submit. Mint stays under the authed `/api/projects/:id/share/intake` — do not add it to `/api/intake/`.

- [ ] **Step 5: Run tests to verify they pass**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- intake`
Expected: PASS (all intake API tests).

- [ ] **Step 6: Full API suite (no regressions)**

Run (sandbox disabled): `pnpm --filter @productmap/api test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/intake.ts apps/api/src/app.ts apps/api/src/routes/intake.test.ts
git commit -m "feat(E5): public intake meta + submit routes with re-validation, rate-limit, honeypot, moderation"
```

---

### Task 7: Web API hooks

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: `IntakeMeta`, `IntakeMintResult` (Task 1); existing `fetchJson`, `useProjectId`, `apiPath`.
- Produces:
  - `useCreateIntake()` → mutation `(vars: { introMd: string; moderation: boolean; expiresInDays: 7|30|90|null }) => Promise<IntakeMintResult>` POSTing `apiPath(pid, 'share', 'intake')`.
  - `useIntakeMeta(token: string)` → query of `IntakeMeta` from `/api/intake/${token}`, `retry: false`, `enabled: token.length > 0`.
  - `useSubmitIntake(token: string)` → mutation `(body: { title: string; bodyMd: string; submitterName?: string; submitterEmail?: string; website: string }) => Promise<{ ok: boolean }>` POSTing `/api/intake/${token}`.
  - Reuse `useRevokeShare` (token-kind-agnostic) for revoke; reuse `useIdeas('pending')` for the pending tab and `useUpdateIdea` for approve/reject.

- [ ] **Step 1: Implement the hooks** — add near the share hooks in `api.ts` (import `IntakeMeta`, `IntakeMintResult` from `@productmap/shared`)

```typescript
export interface CreateIntakeVars {
  introMd: string;
  moderation: boolean;
  expiresInDays: 7 | 30 | 90 | null;
}
export function useCreateIntake() {
  const pid = useProjectId();
  return useMutation({
    mutationFn: (input: CreateIntakeVars) =>
      fetchJson<IntakeMintResult>(apiPath(pid, 'share', 'intake'), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

export function useIntakeMeta(token: string) {
  return useQuery({
    queryKey: ['intake', token],
    queryFn: async () => {
      const res = await activeFetch(`/api/intake/${token}`);
      if (!res.ok) {
        let body: unknown = null;
        try { body = await res.json(); } catch { /* non-json */ }
        throw new ApiError(res.status, body);
      }
      return (await res.json()) as IntakeMeta;
    },
    retry: false,
    enabled: token.length > 0,
  });
}

export interface SubmitIntakeBody {
  title: string;
  bodyMd: string;
  submitterName?: string;
  submitterEmail?: string;
  website: string;
}
export function useSubmitIntake(token: string) {
  return useMutation({
    mutationFn: (body: SubmitIntakeBody) =>
      fetchJson<{ ok: boolean }>(`/api/intake/${token}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}
```

- [ ] **Step 2: Typecheck**

Run (sandbox disabled): `pnpm --filter @productmap/web exec tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(E5): web hooks — useCreateIntake, useIntakeMeta, useSubmitIntake"
```

---

### Task 8: Public intake form page `/p/:token/submit`

**Files:**
- Create: `apps/web/src/routes/IntakePage.tsx`
- Create: `apps/web/src/routes/IntakePage.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `useIntakeMeta`, `useSubmitIntake` (Task 7).
- Produces: a `lazy`-loaded `IntakePage` at `/p/:token/submit`.

- [ ] **Step 1: Write the failing test** — `IntakePage.test.tsx` (mirror `SharePage.test.tsx`: MSW server, MemoryStorage shim, MemoryRouter with `Route path="/p/:token/submit"`, QueryClient with `retry:false`)

```typescript
it('renders intro + form, submits, shows success', async () => {
  // MSW: GET /api/intake/:token → { projectName:'ProductMap', introMd:'Tell us', active:true }
  //      POST /api/intake/:token → { ok:true }
  renderIntake('tok-1');
  expect(await screen.findByText('Tell us')).toBeDefined();
  await userEvent.type(screen.getByLabelText(/title/i), 'My idea');
  await userEvent.click(screen.getByRole('button', { name: /submit/i }));
  expect(await screen.findByText(/thanks/i)).toBeDefined();
});

it('shows the inactive state on a 404 meta', async () => {
  // MSW: GET → 404
  renderIntake('dead');
  expect(await screen.findByText(/isn't active/i)).toBeDefined();
});

it('injects noindex on mount, removes on unmount', async () => {
  const sel = 'meta[name="robots"]';
  expect(document.head.querySelector(sel)).toBeNull();
  const { unmount } = renderIntake('tok-1');
  await screen.findByText('Tell us');
  expect(document.head.querySelector(sel)?.getAttribute('content')).toBe('noindex, nofollow');
  unmount();
  expect(document.head.querySelector(sel)).toBeNull();
});

it('renders a hidden honeypot website field', () => {
  renderIntake('tok-1');
  const hp = document.querySelector('input[name="website"]') as HTMLInputElement | null;
  expect(hp).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (sandbox disabled): `pnpm --filter @productmap/web test -- IntakePage`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `IntakePage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Map as MapIcon } from 'lucide-react';
import { useIntakeMeta, useSubmitIntake } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

export default function IntakePage() {
  const { token = '' } = useParams<{ token: string }>();
  const meta = useIntakeMeta(token);
  const submitMut = useSubmitIntake(token);
  const [title, setTitle] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const [submitterName, setName] = useState('');
  const [submitterEmail, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [done, setDone] = useState(false);

  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    return () => { document.head.removeChild(m); };
  }, []);

  if (meta.isLoading) {
    return <IntakeFrame><Skeleton className="h-8 w-64" /><Skeleton className="mt-6 h-48 w-full rounded-2xl" /></IntakeFrame>;
  }
  if (meta.isError || !meta.data) {
    return (
      <IntakeFrame>
        <div className="mx-auto mt-24 max-w-md rounded-2xl bg-card p-10 text-center shadow-card">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">This form isn't active</h1>
          <p className="mt-2 text-sm text-muted-foreground">The intake link expired, was revoked, or never existed.</p>
        </div>
      </IntakeFrame>
    );
  }
  if (done) {
    return (
      <IntakeFrame>
        <div className="mx-auto mt-24 max-w-md rounded-2xl bg-card p-10 text-center shadow-card">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">Thanks!</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your idea was received.</p>
        </div>
      </IntakeFrame>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitMut.isPending || title.trim() === '') return;
    submitMut.mutate(
      { title, bodyMd, submitterName: submitterName || undefined, submitterEmail: submitterEmail || undefined, website },
      { onSuccess: () => setDone(true) },
    );
  }

  return (
    <IntakeFrame>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{meta.data.projectName}</h1>
      {meta.data.introMd ? <p className="mt-2 text-sm text-muted-foreground">{meta.data.introMd}</p> : null}
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </div>
        <div>
          <Label htmlFor="body">Description</Label>
          <Textarea id="body" value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} maxLength={5000} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Your name (optional)</Label>
            <Input id="name" value={submitterName} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label htmlFor="email">Your email (optional)</Label>
            <Input id="email" type="email" value={submitterEmail} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          </div>
        </div>
        {/* Honeypot — visually hidden, off-screen, not announced. Bots fill it. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
        />
        <Button type="submit" disabled={submitMut.isPending || title.trim() === ''}>
          {submitMut.isPending ? 'Submitting…' : 'Submit idea'}
        </Button>
        {submitMut.isError ? <p className="text-sm text-destructive">Something went wrong. Try again.</p> : null}
      </form>
    </IntakeFrame>
  );
}

function IntakeFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <main className="mx-auto w-full max-w-2xl px-6 py-10">{children}</main>
      <footer className="mx-auto flex w-full max-w-2xl justify-center px-6 pb-10">
        <Link to="/" className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-card transition-colors duration-150 ease-out hover:text-ink">
          <MapIcon className="h-3.5 w-3.5 text-action" aria-hidden />
          Made with ProductMap
        </Link>
      </footer>
    </div>
  );
}
```
(Confirm `@/components/ui/textarea` exists; if not, use a styled `<textarea>` matching the project's input classes.)

- [ ] **Step 4: Add the route** — `App.tsx`

```tsx
// near the SharePage lazy import:
const IntakePage = lazy(() => import('@/routes/IntakePage'));

// as a sibling of the /share/:token route (outside AppShell):
<Route
  path="/p/:token/submit"
  element={
    <Suspense fallback={<RouteFallback />}>
      <IntakePage />
    </Suspense>
  }
/>
```

- [ ] **Step 5: Run test to verify it passes**

Run (sandbox disabled): `pnpm --filter @productmap/web test -- IntakePage`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/IntakePage.tsx apps/web/src/routes/IntakePage.test.tsx apps/web/src/App.tsx
git commit -m "feat(E5): public intake form page at /p/:token/submit"
```

---

### Task 9: Settings IntakeBlock (mint / revoke / configure)

**Files:**
- Create: `apps/web/src/components/settings/IntakeBlock.tsx`
- Create: `apps/web/src/components/settings/IntakeBlock.test.tsx`
- Modify: the settings page that renders `SharingBlock` (find it: `grep -rn "SharingBlock" apps/web/src` — render `IntakeBlock` beside it).

**Interfaces:**
- Consumes: `useCreateIntake`, `useRevokeShare` (Task 7).
- Produces: a settings card to mint an intake link (intro textarea + moderation toggle + optional expiry), display/copy the `/p/<token>/submit` URL, and revoke.

- [ ] **Step 1: Write the failing test** — `IntakeBlock.test.tsx` (mirror `SharingBlock.test.tsx`)

```typescript
it('mints an intake link with the chosen intro + moderation and shows the URL', async () => {
  // MSW: POST /api/projects/:pid/share/intake → { url: '/p/tok-x/submit', expiresAt: null }
  renderIntakeBlock();
  await userEvent.type(screen.getByLabelText(/intro/i), 'Tell us your idea');
  await userEvent.click(screen.getByRole('button', { name: /create intake link/i }));
  const input = await screen.findByLabelText(/intake link/i);
  expect((input as HTMLInputElement).value).toContain('/p/tok-x/submit');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (sandbox disabled): `pnpm --filter @productmap/web test -- IntakeBlock`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `IntakeBlock.tsx`** (model on `SharingBlock.tsx`: `useState` for url, `toast`, copy button, `persist`/read of the link is optional — keep state local for v1)

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy } from 'lucide-react';
import { ApiError, useCreateIntake, useRevokeShare } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function IntakeBlock() {
  const createIntake = useCreateIntake();
  const revoke = useRevokeShare();
  const [introMd, setIntroMd] = useState('');
  const [moderation, setModeration] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const token = url ? url.split('/')[2] : null;
  const absoluteUrl = url ? `${window.location.origin}${url}` : null;

  function create() {
    if (createIntake.isPending) return;
    createIntake.mutate(
      { introMd, moderation, expiresInDays: null },
      {
        onSuccess: ({ url }) => { setUrl(url); toast.success('Intake link created'); },
        onError: () => toast.error("Couldn't create the intake link"),
      },
    );
  }
  function revokeLink() {
    if (!token || revoke.isPending) return;
    revoke.mutate(token, {
      onSuccess: () => { setUrl(null); toast.success('Intake link revoked'); },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 404) { setUrl(null); return; }
        toast.error("Couldn't revoke the intake link");
      },
    });
  }
  async function copy() {
    if (!absoluteUrl) return;
    await navigator.clipboard.writeText(absoluteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="rounded-2xl bg-card p-6 shadow-card">
      <h2 className="font-display text-lg font-semibold text-ink">Public idea intake</h2>
      <p className="mt-1 text-sm text-muted-foreground">A public form anyone can use to submit an idea to this project.</p>
      {absoluteUrl ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input readOnly value={absoluteUrl} aria-label="Intake link" onFocus={(e) => e.currentTarget.select()} className="max-w-md rounded-xl font-mono text-xs" />
          <Button variant="outline" onClick={() => void copy()}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />}{copied ? 'Copied' : 'Copy'}</Button>
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={revokeLink} disabled={revoke.isPending}>Revoke link</Button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="intro">Intro copy</Label>
            <Textarea id="intro" value={introMd} onChange={(e) => setIntroMd(e.target.value)} maxLength={2000} placeholder="Tell visitors what kind of ideas you want." />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={moderation} onChange={(e) => setModeration(e.target.checked)} />
            Hold submissions for approval before they reach the inbox
          </label>
          <Button onClick={create} disabled={createIntake.isPending}>Create intake link</Button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Render it beside `SharingBlock`** in the settings page found via grep.

- [ ] **Step 5: Run test to verify it passes**

Run (sandbox disabled): `pnpm --filter @productmap/web test -- IntakeBlock`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/settings/IntakeBlock.tsx apps/web/src/components/settings/IntakeBlock.test.tsx apps/web/src/routes
git commit -m "feat(E5): settings IntakeBlock — mint/revoke/configure the public intake link"
```

---

### Task 10: Inbox pending tab + approve/reject + notification rendering

**Files:**
- Modify: `apps/web/src/routes/Inbox.tsx`
- Modify: `apps/web/src/components/notifications/NotificationPanel.tsx`
- Modify: `apps/web/src/components/inbox/IdeaDetailPane.tsx` (show submitter contact + public badge)
- Test: `apps/web/src/routes/Inbox.test.tsx` (or the nearest existing inbox test; create `Inbox.test.tsx` if none)

**Interfaces:**
- Consumes: `useIdeas('pending')`, `useUpdateIdea` (Task 7); `IDEA_STATUSES` includes `pending`; notification kind `idea_submitted`.
- Produces: a "Pending review" filter tab; approve (`status:'inbox'`) / reject (`status:'archived'`) actions on pending ideas; `idea_submitted` notifications summarized + linked to the inbox.

- [ ] **Step 1: Write the failing test** — inbox test

```typescript
it('shows a Pending review tab and approves a held idea', async () => {
  // MSW: GET ideas?status=pending → [{ id:'i1', title:'Held', status:'pending', source:'public', ... }]
  //      PATCH ideas/i1 → { ...idea, status:'inbox' }
  renderInbox();
  await userEvent.click(screen.getByRole('button', { name: /pending review/i }));
  expect(await screen.findByText('Held')).toBeDefined();
  await userEvent.click(screen.getByRole('button', { name: /approve/i }));
  // assert the PATCH fired with status:'inbox' (capture the request body in MSW)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (sandbox disabled): `pnpm --filter @productmap/web test -- Inbox`
Expected: FAIL — no Pending tab.

- [ ] **Step 3: Add the Pending tab + STATUS labels/badges** — `Inbox.tsx`

```typescript
// extend STATUS_LABELS and STATUS_BADGE with pending:
  pending: 'Pending',            // in STATUS_LABELS
  pending: 'bg-amber-soft text-amber',   // in STATUS_BADGE (use an existing warning token; check tailwind theme)

// add to the FILTERS array (value is the status string passed to useIdeas):
  { value: 'pending' as const, label: 'Pending review' },
```
The list already calls `useIdeas(filter)`; selecting the Pending tab passes `'pending'`, hitting `?status=pending`.

- [ ] **Step 4: Add approve/reject actions** — in the idea detail pane or list row, gated by `useCanEdit()` and `idea.status === 'pending'`

```tsx
// using useUpdateIdea():
const updateIdea = useUpdateIdea();
function approve(id: string) { updateIdea.mutate({ id, status: 'inbox' }); }
function reject(id: string) { updateIdea.mutate({ id, status: 'archived' }); }
// render two buttons when canEdit && idea.status === 'pending':
<Button size="sm" onClick={() => approve(idea.id)}>Approve</Button>
<Button size="sm" variant="ghost" onClick={() => reject(idea.id)}>Reject</Button>
```

- [ ] **Step 5: Show submitter contact + public badge** — `IdeaDetailPane.tsx`

```tsx
{idea.source === 'public' ? <span className="...badge...">Public submission</span> : null}
{idea.submitterName || idea.submitterEmail ? (
  <p className="text-xs text-muted-ink">From: {idea.submitterName} {idea.submitterEmail ? `<${idea.submitterEmail}>` : ''}</p>
) : null}
```
(Ensure the `IdeaWithVotes` type carries `submitterName`/`submitterEmail` — they come from the `ideas` row select; if the API list/detail explicitly picks columns, add them. Check `ideas.ts` selects return full rows — `db.select()` returns all columns, so they're present.)

- [ ] **Step 6: Add the `idea_submitted` notification case** — `NotificationPanel.tsx`

```typescript
// in summarize():
    case 'idea_submitted': return 'New public idea submitted';
// hrefFor(): public-idea notifications have no doc/feature → link to the project inbox.
// If appRoutes has an inbox builder use it; else fall back to projectOverview.
```
Check `appRoutes` for an inbox route builder; if present use `appRoutes.inbox(n.projectSlug)`, else leave the default `projectOverview`.

- [ ] **Step 7: Run tests to verify they pass**

Run (sandbox disabled): `pnpm --filter @productmap/web test -- Inbox NotificationPanel`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/routes/Inbox.tsx apps/web/src/components/notifications/NotificationPanel.tsx apps/web/src/components/inbox/IdeaDetailPane.tsx apps/web/src/routes/Inbox.test.tsx
git commit -m "feat(E5): inbox pending tab + approve/reject + idea_submitted notifications"
```

---

### Task 11: Full verification + PR

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suites**

Run (sandbox disabled):
```
pnpm --filter @productmap/shared test
pnpm --filter @productmap/api test
pnpm --filter @productmap/web test
```
Expected: all green.

- [ ] **Step 2: Typecheck everything**

Run (sandbox disabled):
```
pnpm --filter @productmap/db exec tsc --noEmit -p tsconfig.json
pnpm --filter @productmap/api exec tsc --noEmit -p tsconfig.json
pnpm --filter @productmap/web exec tsc --noEmit -p tsconfig.json
```
Expected: exit 0 each.

- [ ] **Step 3: Manual smoke (optional, recommended)** — run the app, mint an intake link in Settings, open `/p/<token>/submit` in a private window, submit; confirm it appears under the inbox Pending tab and an `idea_submitted` notification arrives.

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin e5-public-intake
gh pr create --base main --title "E5 — Public idea intake form (per project, unauthenticated)" --body "<summary + the security invariants + test counts>"
```

- [ ] **Step 5: Run the PR review skill** (`pr-review-toolkit:review-pr`) before merge — this feature is an open unauthenticated endpoint; treat the review as mandatory. Fix findings, then merge squash.

---

## Self-Review

**Spec coverage:**
- Moderation default-ON + per-project(token) toggle → Tasks 2 (config), 5 (mint), 6 (submit status), 9 (toggle UI). ✓
- Honeypot + rate-limit → Task 6. ✓
- Optional name/email → Tasks 1 (schema), 2 (columns), 6 (store), 8 (form), 10 (display). ✓
- Reuse share_tokens kind='intake' + config → Tasks 2, 5, 6. ✓
- Notify-on-held → Tasks 4 (helper), 6 (wire), 10 (render). ✓
- Submit re-validates token (invariant 1) → Task 6 `loadActiveIntakeToken` + test. ✓
- Fail-closed moderation (invariant 2) → Task 6 default config. ✓
- projectId from token (invariant 3) → Task 6. ✓
- Contact PII never on public payload (invariant 4) → Task 6 meta returns no ideas/PII; submit echoes only `{ok:true}`. ✓
- pending excluded from default reads (invariant 5) → Task 3 + verified no other count surface (dashboard idea count is features-based). ✓
- Public page noindex + bare frame → Task 8. ✓
- Inbox pending tab + approve/reject → Task 10. ✓
- app allowlist precision (mint stays authed) → Task 6 Step 4. ✓

**Placeholder scan:** Two intentional verify-then-adapt points (drizzle may not regenerate the kind CHECK → hand-fix in Task 2 Step 3; tailwind `amber` token + `appRoutes.inbox` existence checks in Task 10) are written as explicit conditional instructions with the exact fallback, not vague TODOs. No bare "add error handling" / "write tests" placeholders.

**Type consistency:** `IntakeConfig`/`IntakeMintResult`/`IntakeMeta` defined in Task 1, consumed by the same names in Tasks 2/5/6/7/8. `IDEA_INBOX_STATUSES` defined Task 1, used Task 3. `fanOutIdeaSubmittedNotification` signature defined Task 4, called Task 6. Hook names (`useCreateIntake`/`useIntakeMeta`/`useSubmitIntake`) defined Task 7, used Tasks 8/9. Consistent.

# E2b — Notifications Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two in-app notification kinds (`assigned`, `release_published`), make project-favorite double as a release subscription, dedupe unread bursts, and surface actionable notifications on the dashboard.

**Architecture:** Two new best-effort fan-out helpers in the existing `notifications.ts`, wired into the feature-collaborators PUT and the release status-change path. A shared dedupe check skips a second unread row for the same user+kind+target. Web adds rendering + prefs rows; the dashboard gains a bounded `notification` next-action variant.

**Tech Stack:** Hono + Drizzle (Postgres) API, Zod, React + React Query, Vitest.

## Global Constraints

- Work in the worktree `/Users/corbanbaxter/Development/product-map/.claude/worktrees/e2b-notifications` (branch `e2b-notifications`).
- TDD: failing test first, watch it fail, implement, watch it pass, commit.
- API tests need Postgres; the sandbox blocks it — run all api test/db commands with `dangerouslyDisableSandbox: true`. Web tests (MSW/jsdom) run in the sandbox.
- After ANY change to `@productmap/shared`, run `pnpm --filter @productmap/shared build` before web typecheck/tests (web resolves the built package, not source).
- Verify every implementer commit exists in git (`git show --stat HEAD`) before accepting DONE.
- **Notification invariants (all fan-outs):** best-effort try/catch (swallow+log, never fail the triggering write); never notify the actor; respect mutes (`mutedAmong`); recipients derived server-side from real relationships (never client ids); fire only on the real transition (idempotent re-writes notify no one).
- New kinds default-ON and mutable; the `Record<NotificationKind, …>` maps (web `ROWS`, prefs) must stay exhaustive.
- Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XhNkajkFHnMkWCGGGYVM31
  ```

## File Structure

**Modify:**
- `packages/shared/src/constants.ts` — `NOTIFICATION_KINDS` += `assigned`, `release_published`.
- `packages/shared/src/constants.test.ts` — update the exact-array assertion.
- `packages/shared/src/api-types.ts` — add the `notification` `NextAction` variant.
- `packages/db/src/schema.ts` — `NOTIFICATION_KIND_VALUES` += 2 (drives both kind CHECK constraints).
- `packages/db/migrations/*` — generated migration (+ hand-fix CHECK constraints if needed).
- `apps/web/src/demo/demo-runtime.test.ts` — bump migration count.
- `apps/api/src/lib/notifications.ts` — `unreadExists` + `fanOutAssignedNotification` + `fanOutReleasePublishedNotification`.
- `apps/api/src/lib/notifications.test.ts` — unit tests for the two helpers + dedupe.
- `apps/api/src/routes/features.ts` — wire `assigned` into the collaborators PUT.
- `apps/api/src/routes/features.test.ts` (or the collaborators test file) — assigned trigger tests.
- `apps/api/src/routes/releases.ts` — wire `release_published` into `updateRelease`.
- `apps/api/src/routes/releases.test.ts` — release_published trigger tests.
- `apps/web/src/components/notifications/NotificationPanel.tsx` — summarize + href for the 2 kinds.
- `apps/web/src/components/notifications/NotificationPanel.test.tsx` — render/link tests.
- `apps/web/src/components/settings/NotificationsTab.tsx` — `ROWS` += 2 labels.
- `apps/api/src/routes/dashboard.ts` — unread actionable notifications → `nextActions`.
- `apps/api/src/routes/dashboard.test.ts` — notification next-action test.
- `apps/web/src/components/dashboard/NextActions.tsx` — render the `notification` variant.

---

### Task 1: Shared — kinds + NextAction variant

**Files:**
- Modify: `packages/shared/src/constants.ts`, `packages/shared/src/constants.test.ts`, `packages/shared/src/api-types.ts`
- Test: `packages/shared/src/constants.test.ts`

**Interfaces:**
- Produces: `NOTIFICATION_KINDS = ['mention','comment','reply','project_invite','idea_submitted','assigned','release_published']`; new `NextAction` member `{ kind:'notification'; notifKind:'mention'|'assigned'; projectId:string; projectSlug:string; featureId?:string; documentId?:string; title:string }`.

- [ ] **Step 1: Update the failing test** — `constants.test.ts`

```typescript
// in the NOTIFICATION_KINDS describe block, replace the toEqual assertion:
expect(NOTIFICATION_KINDS).toEqual(['mention', 'comment', 'reply', 'project_invite', 'idea_submitted', 'assigned', 'release_published']);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/shared test -- constants`
Expected: FAIL (array mismatch).

- [ ] **Step 3: Implement** — `constants.ts`

```typescript
export const NOTIFICATION_KINDS = ['mention', 'comment', 'reply', 'project_invite', 'idea_submitted', 'assigned', 'release_published'] as const;
```

- [ ] **Step 4: Add the NextAction variant** — `api-types.ts`, extend the `NextAction` union (after the `feature_missing_dates` member)

```typescript
  | { kind: 'notification'; notifKind: 'mention' | 'assigned'; projectId: string; projectSlug: string; featureId?: string; documentId?: string; title: string };
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @productmap/shared test`
Expected: PASS (all shared tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/constants.test.ts packages/shared/src/api-types.ts
git commit -m "feat(E2b): add assigned + release_published kinds and notification NextAction variant"
```

---

### Task 2: DB migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: generated `packages/db/migrations/00NN_*.sql` + meta
- Modify: `apps/web/src/demo/demo-runtime.test.ts`

**Interfaces:**
- Consumes: nothing (mirrors the kinds added in Task 1).
- Produces: `notifications`/`notification_mutes` kind CHECK constraints accept `assigned` + `release_published`.

- [ ] **Step 1: Edit schema** — `schema.ts`, update `NOTIFICATION_KIND_VALUES` (the local const ~line 166 that drives both `kindCheckList` CHECKs)

```typescript
const NOTIFICATION_KIND_VALUES = ['mention', 'comment', 'reply', 'project_invite', 'idea_submitted', 'assigned', 'release_published'] as const;
```

- [ ] **Step 2: Generate the migration**

Run (sandbox disabled): `pnpm --filter @productmap/db generate`
Expected: new `.sql` + `meta/_journal.json` entry + snapshot.

- [ ] **Step 3: Verify & hand-fix the SQL**

Open the new `.sql`. It must DROP+ADD both `notifications_kind_check` and `notification_mutes_kind_check` so each `IN (...)` list includes `'assigned', 'release_published'`. If drizzle-kit did not regenerate them, hand-write (match constraint names from the earlier migration that created them — grep `packages/db/migrations` for `notifications_kind_check`):

```sql
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" IN ('mention', 'comment', 'reply', 'project_invite', 'idea_submitted', 'assigned', 'release_published'));--> statement-breakpoint
ALTER TABLE "notification_mutes" DROP CONSTRAINT "notification_mutes_kind_check";--> statement-breakpoint
ALTER TABLE "notification_mutes" ADD CONSTRAINT "notification_mutes_kind_check" CHECK ("notification_mutes"."kind" IN ('mention', 'comment', 'reply', 'project_invite', 'idea_submitted', 'assigned', 'release_published'));
```

- [ ] **Step 4: Apply + typecheck**

Run (sandbox disabled): `pnpm --filter @productmap/db migrate` then `pnpm --filter @productmap/db exec tsc --noEmit -p tsconfig.json`
Expected: applies cleanly; tsc exit 0.

- [ ] **Step 5: Bump demo migration count** — in `apps/web/src/demo/demo-runtime.test.ts`, increment the exact migration-count assertion by 1.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations apps/web/src/demo/demo-runtime.test.ts
git commit -m "feat(E2b): migration — allow assigned + release_published notification kinds"
```

---

### Task 3: Fan-out helpers + dedupe

**Files:**
- Modify: `apps/api/src/lib/notifications.ts`
- Test: `apps/api/src/lib/notifications.test.ts`

**Interfaces:**
- Consumes: kinds (Tasks 1–2), existing `mutedAmong`, `notifications`/`memberships`/`projectFavorites` tables, `db`.
- Produces:
  - `fanOutAssignedNotification(params: { featureId: string; projectId: string; addedUserIds: string[]; actorId: string | null }): Promise<void>`
  - `fanOutReleasePublishedNotification(params: { projectId: string; releaseId: string; releaseName: string; actorId: string | null }): Promise<void>`

- [ ] **Step 1: Write the failing tests** — append to `notifications.test.ts` (the harness already builds alice/bob/project/feature in `beforeEach`)

```typescript
it('fanOutAssignedNotification notifies added users (not actor/muted), deduping unread', async () => {
  const { fanOutAssignedNotification } = await import('../lib/notifications');
  await fanOutAssignedNotification({ featureId, projectId, addedUserIds: [bob.id, alice.id], actorId: alice.id });
  let rows = await db.select().from(notifications).where(and(eq(notifications.userId, bob.id), eq(notifications.kind, 'assigned')));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ featureId, actorId: alice.id });
  // actor (alice) excluded
  expect((await db.select().from(notifications).where(and(eq(notifications.userId, alice.id), eq(notifications.kind, 'assigned')))).length).toBe(0);
  // dedupe: re-fire while unread → still 1
  await fanOutAssignedNotification({ featureId, projectId, addedUserIds: [bob.id], actorId: alice.id });
  rows = await db.select().from(notifications).where(and(eq(notifications.userId, bob.id), eq(notifications.kind, 'assigned')));
  expect(rows).toHaveLength(1);
});

it('release_published notifies only favoriters, excludes actor + muted', async () => {
  const { fanOutReleasePublishedNotification } = await import('../lib/notifications');
  const [rel] = await db.insert(releases).values({ projectId, name: 'v1', status: 'shipped', shippedAt: new Date() }).returning();
  // bob favorited; alice (actor) did not
  await db.insert(projectFavorites).values({ userId: bob.id, projectId });
  await fanOutReleasePublishedNotification({ projectId, releaseId: rel.id, releaseName: 'v1', actorId: alice.id });
  const rows = await db.select().from(notifications).where(eq(notifications.kind, 'release_published'));
  expect(rows.map((r) => r.userId)).toEqual([bob.id]);
  expect(rows[0].payload).toMatchObject({ releaseId: rel.id, name: 'v1' });
});
```
Add `releases`, `projectFavorites` to the test's `@productmap/db/schema` import.

- [ ] **Step 2: Run tests to verify they fail**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- notifications`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement** — append to `notifications.ts` (`memberships`, `inArray`, `and`, `eq`, `sql`, `notifications`, `db` already imported; add `projectFavorites`, `releases`? — only `projectFavorites` is needed; add it to the schema import)

```typescript
/** True if the user already has an UNREAD notification of `kind` for the same target. */
async function unreadExists(
  userId: string,
  kind: NotificationKind,
  match: { featureId?: string; releaseId?: string },
): Promise<boolean> {
  const conds = [
    eq(notifications.userId, userId),
    eq(notifications.kind, kind),
    isNull(notifications.readAt),
  ];
  if (match.featureId) conds.push(eq(notifications.featureId, match.featureId));
  if (match.releaseId) conds.push(sql`${notifications.payload}->>'releaseId' = ${match.releaseId}`);
  const [row] = await db.select({ id: notifications.id }).from(notifications).where(and(...conds)).limit(1);
  return !!row;
}

/** Notify users newly added as collaborators on a feature. Best-effort. */
export async function fanOutAssignedNotification(
  params: { featureId: string; projectId: string; addedUserIds: string[]; actorId: string | null },
): Promise<void> {
  try {
    const candidates = params.addedUserIds.filter((id) => id !== params.actorId);
    if (candidates.length === 0) return;
    const muted = await mutedAmong(candidates, 'assigned');
    const rows: (typeof notifications.$inferInsert)[] = [];
    for (const userId of candidates) {
      if (muted.has(userId)) continue;
      if (await unreadExists(userId, 'assigned', { featureId: params.featureId })) continue;
      rows.push({ userId, projectId: params.projectId, kind: 'assigned', actorId: params.actorId, featureId: params.featureId, payload: null });
    }
    if (rows.length > 0) await db.insert(notifications).values(rows);
  } catch (err) {
    console.error('[notifications] assigned fan-out failed (swallowed):', { featureId: params.featureId }, err);
  }
}

/** Notify project favoriters that a release shipped. Best-effort. */
export async function fanOutReleasePublishedNotification(
  params: { projectId: string; releaseId: string; releaseName: string; actorId: string | null },
): Promise<void> {
  try {
    const favs = await db
      .select({ userId: projectFavorites.userId })
      .from(projectFavorites)
      .where(eq(projectFavorites.projectId, params.projectId));
    const ids = favs.map((f) => f.userId).filter((id) => id !== params.actorId);
    if (ids.length === 0) return;
    const muted = await mutedAmong(ids, 'release_published');
    const rows: (typeof notifications.$inferInsert)[] = [];
    for (const userId of ids) {
      if (muted.has(userId)) continue;
      if (await unreadExists(userId, 'release_published', { releaseId: params.releaseId })) continue;
      rows.push({ userId, projectId: params.projectId, kind: 'release_published', actorId: params.actorId, payload: { releaseId: params.releaseId, name: params.releaseName } });
    }
    if (rows.length > 0) await db.insert(notifications).values(rows);
  } catch (err) {
    console.error('[notifications] release_published fan-out failed (swallowed):', { releaseId: params.releaseId }, err);
  }
}
```
Ensure `isNull` is imported from `drizzle-orm` in this file (the existing query helpers import `and, eq, inArray, or, sql` — add `isNull`).

- [ ] **Step 4: Run tests to verify they pass**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- notifications`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/notifications.ts apps/api/src/lib/notifications.test.ts
git commit -m "feat(E2b): assigned + release_published fan-out helpers with unread dedupe"
```

---

### Task 4: Wire `assigned` into the collaborators PUT

**Files:**
- Modify: `apps/api/src/routes/features.ts:244-266` (the `.put('/:id/collaborators', …)` handler)
- Test: `apps/api/src/routes/features.test.ts` (or wherever collaborators are tested — search; create a focused test if none)

**Interfaces:**
- Consumes: `fanOutAssignedNotification` (Task 3).
- Produces: PUT collaborators fires `assigned` for newly-added users only.

- [ ] **Step 1: Write the failing test** — add to the features collaborators test

```typescript
it('PUT collaborators notifies only newly-added users, not the actor or pre-existing', async () => {
  // actor = alice; feature already has alice as collaborator; add bob.
  await db.insert(featureCollaborators).values({ featureId, userId: alice.id }).onConflictDoNothing();
  const res = await app.request(`/api/projects/${projectId}/features/${featureId}/collaborators`, {
    method: 'PUT', headers: { 'content-type': 'application/json', ...aliceAuth },
    body: JSON.stringify({ userIds: [alice.id, bob.id] }),
  });
  expect(res.status).toBe(204);
  const notifs = await db.select().from(notifications).where(eq(notifications.kind, 'assigned'));
  expect(notifs.map((n) => n.userId)).toEqual([bob.id]); // alice (actor + pre-existing) excluded
});
```
(Match the test file's existing harness for `aliceAuth`/`projectId`/`featureId`.)

- [ ] **Step 2: Run test to verify it fails**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- features`
Expected: FAIL — no assigned notification.

- [ ] **Step 3: Implement** — modify the handler (`features.ts:251-264`) to diff and fan out; add `fanOutAssignedNotification` to the `../lib/notifications` import

```typescript
    async (c) => {
      const id = c.req.param('id');
      const pid = c.get('currentProjectId');
      const { userIds } = c.req.valid('json');
      await loadScoped(features, id, pid);
      // Capture the prior set to notify only NEW collaborators.
      const existing = await db
        .select({ userId: featureCollaborators.userId })
        .from(featureCollaborators)
        .where(eq(featureCollaborators.featureId, id));
      const existingIds = new Set(existing.map((r) => r.userId));
      await db.delete(featureCollaborators).where(eq(featureCollaborators.featureId, id));
      if (userIds.length > 0) {
        await db
          .insert(featureCollaborators)
          .values(userIds.map((userId) => ({ featureId: id, userId })))
          .onConflictDoNothing();
      }
      const addedUserIds = userIds.filter((u) => !existingIds.has(u));
      await fanOutAssignedNotification({ featureId: id, projectId: pid, addedUserIds, actorId: c.get('currentUser')?.id ?? null });
      return c.body(null, 204);
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- features`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/features.ts apps/api/src/routes/features.test.ts
git commit -m "feat(E2b): fire assigned notification when collaborators are added"
```

---

### Task 5: Wire `release_published` into `updateRelease`

**Files:**
- Modify: `apps/api/src/routes/releases.ts` (`updateRelease`, the `statusChanged` block)
- Test: `apps/api/src/routes/releases.test.ts`

**Interfaces:**
- Consumes: `fanOutReleasePublishedNotification` (Task 3).
- Produces: shipping a release (planned→shipped) fires `release_published` to favoriters.

- [ ] **Step 1: Write the failing test** — `releases.test.ts`

```typescript
it('shipping a release notifies project favoriters (not the actor)', async () => {
  // harness: a project + actor; create a release planned, a favoriter (not actor)
  const favoriter = await createTestUser({ role: 'member', name: 'Fav', email: 'fav@test.co' });
  await addMembership(favoriter.id, projectId, 'viewer');
  await db.insert(projectFavorites).values({ userId: favoriter.id, projectId });
  const [rel] = await db.insert(releases).values({ projectId, name: 'v1', status: 'planned' }).returning();
  const res = await app.request(`/api/projects/${projectId}/releases/${rel.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ status: 'shipped' }),
  });
  expect(res.status).toBe(200);
  const notifs = await db.select().from(notifications).where(eq(notifications.kind, 'release_published'));
  expect(notifs.map((n) => n.userId)).toEqual([favoriter.id]);
  expect(notifs[0].payload).toMatchObject({ releaseId: rel.id, name: 'v1' });
});

it('re-shipping an already-shipped release fires no notification', async () => {
  const favoriter = await createTestUser({ role: 'member', name: 'F2', email: 'f2@test.co' });
  await db.insert(projectFavorites).values({ userId: favoriter.id, projectId });
  const [rel] = await db.insert(releases).values({ projectId, name: 'v2', status: 'shipped', shippedAt: new Date() }).returning();
  await app.request(`/api/projects/${projectId}/releases/${rel.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ status: 'shipped' }),
  });
  expect((await db.select().from(notifications).where(eq(notifications.kind, 'release_published'))).length).toBe(0);
});
```
(Match `releases.test.ts`'s existing harness names for `auth`/`projectId`/`createTestUser`/`addMembership`; add `notifications`, `projectFavorites` to its schema import.)

- [ ] **Step 2: Run tests to verify they fail**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- releases`
Expected: FAIL — no release_published notification.

- [ ] **Step 3: Implement** — in `updateRelease`, after the `statusChanged` activity loop, fan out on the publish transition; add `fanOutReleasePublishedNotification` to the `../lib/notifications` import

```typescript
  if (statusChanged) {
    for (const feature of await releaseFeatures(id, prev.projectId)) {
      await recordActivity(feature.id, prev.projectId, userId, 'release_status_changed', {
        releaseId: row.id, releaseName: row.name, from: prev.status, to: row.status,
      });
    }
    // E2b: notify favoriters only when a release is newly published.
    if (prev.status === 'planned' && row.status === 'shipped') {
      await fanOutReleasePublishedNotification({ projectId: prev.projectId, releaseId: row.id, releaseName: row.name, actorId: userId ?? null });
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- releases`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/releases.ts apps/api/src/routes/releases.test.ts
git commit -m "feat(E2b): fire release_published notification to favoriters on ship"
```

---

### Task 6: Web — render + prefs for the two kinds

**Files:**
- Modify: `apps/web/src/components/notifications/NotificationPanel.tsx`, `apps/web/src/components/settings/NotificationsTab.tsx`
- Test: `apps/web/src/components/notifications/NotificationPanel.test.tsx`

**Interfaces:**
- Consumes: kinds (Task 1); `NotificationItem.payload` (already typed `Record<string,unknown>|null`).
- Produces: panel summaries + links for `assigned`/`release_published`; prefs toggles for both.

- [ ] **Step 1: Write the failing tests** — add two mock items + assertions to `NotificationPanel.test.tsx`

```typescript
// add to the mocked items array:
{ id: 'n4', kind: 'assigned', actorName: 'Dana', documentId: null, featureId: 'feat-789', projectSlug: 'my-project', payload: null, readAt: null, createdAt: new Date().toISOString() },
{ id: 'n5', kind: 'release_published', actorName: 'Eli', documentId: null, featureId: null, projectSlug: 'my-project', payload: { releaseId: 'r1', name: 'v2.0' }, readAt: null, createdAt: new Date().toISOString() },

// add tests:
it('assigned item links to the feature', () => {
  const { panel } = renderPanel();
  const link = panel.getByText(/dana assigned you/i).closest('a');
  expect(link?.getAttribute('href')).toContain('/features/');
  expect(link?.getAttribute('href')).toContain('feat-789');
});
it('release_published item shows the release name', () => {
  const { panel } = renderPanel();
  expect(panel.getByText(/eli shipped v2\.0/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/web test -- NotificationPanel`
Expected: FAIL — default summary / no link.

- [ ] **Step 3: Implement** — `NotificationPanel.tsx`

```typescript
// in summarize():
    case 'assigned': return `${who} assigned you to a feature`;
    case 'release_published': return `${who} shipped ${(n.payload?.name as string) ?? 'a release'}`;
// in hrefFor(): the existing documentId/featureId checks already route assigned (it has featureId)
// to appRoutes.feature. release_published has neither doc nor feature → falls through to
// appRoutes.projectOverview(n.projectSlug). Confirm that fallthrough exists; no change needed if so.
```

- [ ] **Step 4: Add prefs rows** — `NotificationsTab.tsx` `ROWS`

```typescript
  assigned: 'Assigned to a feature',
  release_published: 'A release I follow ships',
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @productmap/shared build && pnpm --filter @productmap/web test -- NotificationPanel NotificationsTab`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/notifications/NotificationPanel.tsx apps/web/src/components/notifications/NotificationPanel.test.tsx apps/web/src/components/settings/NotificationsTab.tsx
git commit -m "feat(E2b): render assigned + release_published notifications and prefs rows"
```

---

### Task 7: Dashboard — actionable notifications as nextActions

**Files:**
- Modify: `apps/api/src/routes/dashboard.ts`, `apps/web/src/components/dashboard/NextActions.tsx`
- Test: `apps/api/src/routes/dashboard.test.ts`

**Interfaces:**
- Consumes: the `notification` NextAction variant (Task 1); `notifications` table; existing `pids`/`slugByPid` in dashboard.ts.
- Produces: dashboard `nextActions` include up to 5 unread `mention`/`assigned` notifications, deep-linked.

- [ ] **Step 1: Write the failing test** — `dashboard.test.ts`

```typescript
it('surfaces unread assigned/mention notifications as nextActions (capped)', async () => {
  // harness builds a user + project they belong to; insert an unread assigned notif on a feature
  const [f] = await db.insert(features).values({ projectId, title: 'Feat', horizon: 'now' }).returning();
  await db.insert(notifications).values({ userId, projectId, kind: 'assigned', actorId: null, featureId: f.id });
  const res = await app.request('/api/dashboard', { headers: auth });
  const body = await res.json();
  const notifActions = body.nextActions.filter((a: { kind: string }) => a.kind === 'notification');
  expect(notifActions.length).toBe(1);
  expect(notifActions[0]).toMatchObject({ kind: 'notification', notifKind: 'assigned', featureId: f.id });
});
```
(Match `dashboard.test.ts` harness names; add `notifications` to its schema import.)

- [ ] **Step 2: Run test to verify it fails**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- dashboard`
Expected: FAIL — no notification nextAction.

- [ ] **Step 3: Implement** — `dashboard.ts`, after the existing nextActions pushes (near line 215), add a bounded query (use the existing `pids`/`activePids` scope var and `slugByPid`); add `notifications` to the schema import

```typescript
  // 7c) notification: up to 5 unread actionable notifications (mention/assigned).
  const notifRows = await db
    .select({
      kind: notifications.kind,
      projectId: notifications.projectId,
      featureId: notifications.featureId,
      documentId: notifications.documentId,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.id),
        isNull(notifications.readAt),
        inArray(notifications.kind, ['mention', 'assigned']),
        inArray(notifications.projectId, activePids),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(5);
  for (const n of notifRows) {
    nextActions.push({
      kind: 'notification',
      notifKind: n.kind as 'mention' | 'assigned',
      projectId: n.projectId,
      projectSlug: slugByPid.get(n.projectId) ?? '',
      featureId: n.featureId ?? undefined,
      documentId: n.documentId ?? undefined,
      title: n.kind === 'assigned' ? 'You were assigned to a feature' : 'You were mentioned',
    });
  }
```
Confirm `isNull`, `desc`, `inArray` are imported in dashboard.ts (add any missing). Use the same scope variable the other nextActions use (`activePids` per the reviewDocRows block).

- [ ] **Step 4: Refine the existing `notification` case** — `NextActions.tsx` `describe()` switch

NOTE: Task 6 already ADDED a `notification` case to this switch (forced by Task 1 growing the `NextAction` union — TS2366). Its current form uses `MessageSquare` and routes `to: a.featureId ? feature : projectOverview` — which DROPS the `documentId` deep-link for a mention on a doc. Do NOT add a second case (duplicate). Instead REPLACE the existing case body so it handles `documentId`:

```typescript
    case 'notification':
      return {
        icon: Bell,
        to: a.featureId ? appRoutes.feature(a.featureId) : a.documentId ? appRoutes.doc(a.documentId) : appRoutes.projectOverview(a.projectSlug),
        text: a.title,
      };
```
Import `Bell` from `lucide-react` at the top of `NextActions.tsx` (and drop the `MessageSquare` import only if it becomes unused).

- [ ] **Step 5: Run tests**

Run (sandbox disabled): `pnpm --filter @productmap/api test -- dashboard` then `pnpm --filter @productmap/shared build && pnpm --filter @productmap/web test -- NextActions`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/dashboard.ts apps/api/src/routes/dashboard.test.ts apps/web/src/components/dashboard/NextActions.tsx
git commit -m "feat(E2b): surface unread mention/assigned notifications on the dashboard"
```

---

### Task 8: Full verification + PR

**Files:** none (verification only)

- [ ] **Step 1: Build (cross-package gate)**

Run (sandbox disabled): `pnpm -r build`
Expected: exit 0.

- [ ] **Step 2: All suites**

Run (sandbox disabled):
```
pnpm --filter @productmap/shared test
pnpm --filter @productmap/api test
pnpm --filter @productmap/web test
```
Expected: all green.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin e2b-notifications
gh pr create --base main --title "E2b — Notifications: assigned + release_published, dashboard wiring" --body "<summary + invariants + test counts>"
```

- [ ] **Step 4: Run the final whole-branch review** (subagent-driven-development handles this) and address findings before merge.

---

## Self-Review

**Spec coverage:**
- New kinds `assigned`/`release_published` → Tasks 1, 2. ✓
- `assigned` trigger (collaborators PUT, newly-added only, not actor) → Task 4. ✓
- `release_published` trigger (ship transition, favoriters) → Tasks 3, 5. ✓
- Favorite-as-subscription → Task 3 (`fanOutReleasePublishedNotification` queries `projectFavorites`). ✓
- Server-side dedupe (unread, same user+kind+target) → Task 3 (`unreadExists`). ✓
- Best-effort / no-actor / mutes / create-only invariants → Tasks 3–5 (try/catch, actor filter, `mutedAmong`, transition guards). ✓
- Web rendering + prefs → Task 6. ✓
- Dashboard wiring (bounded, mention+assigned) → Tasks 1 (variant), 7. ✓
- Migration kind CHECK + demo count → Task 2. ✓

**Placeholder scan:** Two explicit verify-then-adapt points (Task 2 hand-fix CHECK if drizzle skips it; Task 6/7 confirm existing `hrefFor` fallthrough + imports) are written with exact fallback code, not vague TODOs. No bare "add tests"/"handle errors".

**Type consistency:** `fanOutAssignedNotification` / `fanOutReleasePublishedNotification` signatures defined in Task 3 are consumed by the same names in Tasks 4–5. The `notification` NextAction variant fields (`notifKind`, `featureId?`, `documentId?`, `projectSlug`, `title`) defined in Task 1 are produced in Task 7 and consumed in Task 7's render. `unreadExists` keys on `featureId` / `payload->>'releaseId'` consistently with the insert payloads.

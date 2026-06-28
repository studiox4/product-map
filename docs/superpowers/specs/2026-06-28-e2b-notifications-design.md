# E2b — Notifications: assigned + release_published, favorite-as-subscription, dedupe, dashboard wiring

**Status:** Approved (brainstorm) — 2026-06-28
**Backlog:** `BACKLOG.md` E2 (Notifications)
**Builds on:** E2a in-app core (PR #21, `notifications`/`notification_mutes` tables, bell/panel/prefs, `fanOut*` helpers) · E3 dashboard (`projectFavorites`, `nextActions`)

## Goal

Extend the shipped in-app notification system with two new event types, make "favorite" double as a project-level subscription, add lightweight server-side dedupe, and surface actionable notifications on the dashboard — all in-app only (no new channels; email/Slack remain the blocked E2c/E2d).

## Scope decisions (locked in brainstorm)

| Decision | Choice |
|----------|--------|
| New kinds | `assigned`, `release_published` (NOT status-changed / comment-resolved this slice) |
| Project-level recipients | Reuse `projectFavorites` as the subscription — no new follow table |
| Anti-spam | Server-side dedupe (skip a second *unread* row for same user+kind+target); NOT panel burst-grouping |
| Dashboard | Surface unread actionable notifications (`mention`, `assigned`) as bounded `nextActions` |
| Channel × event matrix | Deferred (premature with only the in-app channel) |

## Invariants / guardrails (carried from E2a + the review lessons)

1. **Fan-out is best-effort** — wrapped in try/catch that swallows + logs; a notification failure must never fail the triggering write (mirrors `fanOutCommentNotifications` / `fanOutInviteNotification`).
2. **Never notify the actor** — exclude the acting user from every recipient set.
3. **Respect mutes** — drop recipients who muted the kind (`mutedAmong`).
4. **Never trust client-supplied recipient ids** — recipients are derived server-side from real relationships (collaborators, favorites, memberships).
5. **Create-only** — events fire on the triggering transition, not on idempotent re-writes (re-shipping a shipped release is a no-op; re-PUTting the same collaborator set notifies no one).

## Data model

### `NOTIFICATION_KINDS` — add two
`['mention','comment','reply','project_invite','idea_submitted','assigned','release_published']`
- Update `packages/shared/src/constants.ts` `NOTIFICATION_KINDS` **and** the schema's `NOTIFICATION_KIND_VALUES` + the `notifications_kind_check` / `notification_mutes_kind_check` CHECK constraints (migration). Keep the two in lockstep (the type-drift class flagged in prior reviews).
- No new columns. `assigned` uses the existing `featureId`; `release_published` uses `payload jsonb = { releaseId, name }` (notifications has no release FK — consistent with how `idea_submitted` stores `{ideaId,title}`).
- Migration: `ALTER TABLE ... DROP/ADD CONSTRAINT` for both kind checks (verify drizzle-kit regenerates them; hand-write if not, as in E5). Bump the demo migration-count test.

## API — fan-out helpers (`apps/api/src/lib/notifications.ts`)

### `fanOutAssignedNotification`
```
fanOutAssignedNotification(params: { featureId: string; projectId: string; addedUserIds: string[]; actorId: string | null }): Promise<void>
```
- For each `addedUserIds` minus the actor, minus muters of `'assigned'`, insert `{ userId, projectId, kind:'assigned', actorId, featureId, payload:null }`.
- **Dedupe:** skip a user who already has an *unread* `assigned` notification for the same `featureId` (see Dedupe helper).
- Best-effort try/catch.

### `fanOutReleasePublishedNotification`
```
fanOutReleasePublishedNotification(params: { projectId: string; releaseId: string; releaseName: string; actorId: string | null }): Promise<void>
```
- Recipients = users with a `projectFavorites` row for `projectId` (the subscription), minus the actor, minus muters of `'release_published'`.
- Insert `{ userId, projectId, kind:'release_published', actorId, payload:{ releaseId, name: releaseName } }`.
- **Dedupe:** skip a user who already has an *unread* `release_published` for the same `releaseId`.
- Best-effort try/catch.

### Dedupe helper (shared, internal)
```
async function unreadExists(userId, kind, match: { featureId?: string; releaseId?: string }): boolean
```
Queries `notifications` for `userId = ? AND kind = ? AND readAt IS NULL AND (featureId = ? | payload->>'releaseId' = ?)`. Used to filter recipients before insert. Keep the SQL in one place; both fan-outs call it. (Low-frequency events, so a per-recipient existence check is acceptable; if it ever proves hot, batch it.)

## API — trigger wiring

### `assigned` — `PUT /api/projects/:projectId/features/:id/collaborators` (`features.ts:244`)
The handler currently deletes all collaborators then reinserts `userIds`. Change to:
1. Before the delete, load the existing collaborator `userId`s for the feature.
2. After the reinsert commits, compute `added = userIds − existing`, and call `fanOutAssignedNotification({ featureId:id, projectId:pid, addedUserIds:added, actorId:user?.id })`.
Re-PUTting the same set ⇒ `added` empty ⇒ no notifications (invariant 5).

### `release_published` — `updateRelease` (`releases.ts:~49`)
Already detects the `planned→shipped` transition (sets `shippedAt`, records `release_status_changed`). On exactly that transition (not same-status no-ops), call `fanOutReleasePublishedNotification({ projectId, releaseId:id, releaseName:row.name, actorId:userId })`. Both PATCH `{status:'shipped'}` and the `/ship` alias route through `updateRelease`, so wiring it there covers both.

## Web

### Notification rendering (`NotificationPanel.tsx`)
- `summarize()`: add `case 'assigned': return ` `${who} assigned you to a feature` `;` and `case 'release_published': return ` `${who} shipped ${n.payload?.name ?? 'a release'}` `;`.
- `hrefFor()`: `assigned` → `appRoutes.feature(n.featureId)`; `release_published` → the release's project (e.g. `appRoutes.projectOverview(n.projectSlug)` or a releases route if one exists — use what's available, else project overview).
- `NotificationItem` type may need `payload` exposed for the release name — confirm the shape the API already returns and extend the web type if needed.

### Prefs (`NotificationsTab.tsx`)
Add `assigned` + `release_published` rows to the `ROWS` Record (label each); default-on, mutable. The `Record<NotificationKind,string>` must stay exhaustive (the compile-time guard from prior reviews).

### Dashboard nextActions
- New `NextAction` variant: `{ kind: 'notification'; notifKind: 'mention' | 'assigned'; projectId: string; projectSlug: string; featureId?: string; documentId?: string; title: string }`.
- In `dashboard.ts`, after the existing nextActions, query the caller's unread notifications of kind `mention`/`assigned` (capped, e.g. top 5, newest first, scoped to the dashboard's project set), map to the new variant, push. Read-only; the bell remains source of truth. Render in `NextActions.tsx` with a deep link via the same target logic as the panel.

## Testing

**API**
- `assigned`: PUT collaborators adding user B (actor A) → B gets one `assigned` (featureId set, actorId=A); A (actor) gets none; re-PUT same set → no new notifications; a muted user gets none; dedupe → second add while first unread inserts nothing.
- `release_published`: shipping a release notifies only favoriters (not all members), excludes actor, excludes muters; same-status re-ship → no notification; dedupe on re-trigger while unread.
- Best-effort: a fan-out throw does not fail the collaborators PUT / release update (simulate and assert the write still succeeds).
- Migration: both new kinds accepted by the CHECK constraints; prefs default-on includes them.

**Web**
- `NotificationPanel` renders `assigned` + `release_published` summaries with correct links.
- `NotificationsTab` shows the two new toggle rows.
- Dashboard surfaces an unread `assigned`/`mention` as a `nextActions` item, capped, deep-linked.

## Out of scope (this slice)
- status-changed / comment-resolved / new-doc event types (next in-app slice; status-changed is the one that would justify true burst-grouping).
- Separate follow table (favorite is the subscription for now).
- Channel × event preference matrix, email/Slack/Teams (E2c/E2d, infra-blocked).
- True panel burst-grouping (deferred with status-changed).

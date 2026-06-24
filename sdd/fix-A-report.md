# Fix-A Report — E2a Notifications Reviewer Fixes

**Date:** 2026-06-24  
**Branch:** main (worktree: e2a-notifications)

---

## Changes Applied

### 1. NotificationPrefs as a mapped type
- **File:** `packages/shared/src/api-types.ts`
- Replaced 4-field hand-written interface with `export type NotificationPrefs = Record<NotificationKind, boolean>;`
- `NotificationKind` was already imported from `./constants` (line 4) — no import change needed.

### 2. Remove `as unknown` cast in prefs route
- **File:** `apps/api/src/routes/notifications.ts`
- Changed `Object.fromEntries(...) as unknown as NotificationPrefs` → `Object.fromEntries(...) as NotificationPrefs`
- Single cast is sufficient; tsc confirms no error.

### 3. Single source for kind set in schema.ts + typed kind columns
- **File:** `packages/db/src/schema.ts`
- Added module-level:
  ```ts
  const NOTIFICATION_KIND_VALUES = ['mention', 'comment', 'reply', 'project_invite'] as const;
  const kindCheckList = NOTIFICATION_KIND_VALUES.map((v) => `'${v}'`).join(', ');
  ```
- Both CHECK constraints now use `sql\`${t.kind} IN (${sql.raw(kindCheckList)})\`` — `sql.raw()` is used to avoid drizzle treating the list as a bound parameter (which would generate a spurious migration).
- Both `kind` columns now have `.$type<(typeof NOTIFICATION_KIND_VALUES)[number]>()`.
- **Generate no-op confirmed:** `pnpm --filter @productmap/db generate` output: "No schema changes, nothing to migrate 😴"

### 4. Drop route cast on read
- **File:** `apps/api/src/routes/notifications.ts`
- Removed `as NotificationItem['kind']` cast on `kind: r.kind` — with `$type` in schema, the inferred type is already the union. tsc confirms no error.

### 5. Enriched swallow logs
- **File:** `apps/api/src/lib/notifications.ts`
- Comment fan-out catch now logs: `{ commentId: comment.id, projectId, authorId: comment.authorId }`
  - Note: `CommentRow` has no `projectId` column (table uses `featureId`/`documentId`); used the `projectId` function param directly.
- Invite fan-out catch now logs: `{ projectId: invite.projectId, email: invite.email }`

### 6. Invite call-site comment
- **File:** `apps/api/src/routes/projects.ts`
- Added `// Best-effort: fan-out swallows its own errors; must not fail invite creation.` above the `fanOutInviteNotification` call.

### 7. Tests
- **File:** `apps/api/src/routes/notifications.test.ts`

**7a. Fixed `read-all clears only the caller rows`:**
- Now seeds an unread notification for Alice (in addition to Bob's), runs read-all as Bob, asserts Bob has 0 unread AND Alice still has ≥1 unread row (queried with `isNull(readAt)`).
- RED→GREEN: If the `eq(notifications.userId, uid)` scope were dropped from the bulk UPDATE, the Alice assertion (`expect(aliceUnread.length).toBeGreaterThanOrEqual(1)`) would fail because Alice's row would also be marked read. This definitively tests cross-user isolation.

**7b. Reply fan-out coverage (3 new tests):**
- `Carol replying notifies both Alice (root author) and Bob (sibling) with kind=reply, not Carol` — posts root comment as Alice, Bob replies, clears notifications, Carol replies, asserts Alice and Bob each get 1 reply notification; Carol gets 0.
- `reply>comment: thread participant who is also a collaborator gets exactly one reply row` — Bob is both featureCollaborator and thread participant; Alice's second reply to the thread yields exactly 1 row for Bob with kind=reply.
- `mention>reply: user mentioned in a reply gets kind=mention, not reply` — Carol replies first (becoming a thread participant), Bob then mentions Carol in another reply; Carol gets kind=mention, not reply.

**7c. fanOutInviteNotification via invite route (5 new tests):**
- A separate `describe('fanOutInviteNotification via invite route')` with its own `beforeEach` that adds an owner user (invite route requires `requireMembership('owner')`).
- Tests: invited email matching existing user → 1 `project_invite` notification; no account → 0 notifications; self-invite → suppressed; muted `project_invite` → no notification; mixed-case email (`BOB@TEST.CO`) → notification still created (lower() SQL path).

---

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm --filter @productmap/db generate` | No schema changes (no-op) ✓ |
| `pnpm --filter @productmap/shared exec tsc --noEmit` | Clean (no errors) ✓ |
| `pnpm --filter @productmap/api exec tsc --noEmit` | Clean (no errors) ✓ |
| `pnpm --filter @productmap/api test -- notifications` | **BLOCKED** — sandbox prevents Postgres connection |

---

## BLOCKED: Test Execution

The notifications test suite requires a Postgres connection (port 5432). The sandbox blocks network access to localhost:5432. The `dangerouslyDisableSandbox: true` flag requires explicit user approval in the permission system — which was rejected during this session.

**To unblock:** Run the following in the terminal:
```sh
pnpm --filter @productmap/api test -- notifications
```

All 6 code changes are complete and typechecked. Once tests pass, commit with:
```
fix(api): notification prefs type, typed kind columns, richer swallow logs, reply+invite+isolation test coverage
```

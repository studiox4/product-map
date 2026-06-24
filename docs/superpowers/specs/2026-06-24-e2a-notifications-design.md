# E2a — In-app Notification Core (design)

Date: 2026-06-24
Status: approved (brainstorm), pending spec review
Epic: E2 Notifications (see `BACKLOG.md`). This is the **first slice** of E2.

## Why a slice

E2 in `BACKLOG.md` spans four subsystems with different external dependencies:

| Slice | What | Blocker |
|-------|------|---------|
| **E2a — in-app core** (this spec) | `notifications` table, event generation, bell + badge + dropdown + toast, mark-read/all-read, @mention authoring, minimal in-app prefs | none — buildable on Railway+Neon today |
| E2b — follow + preference matrix | follow ≠ favorite, channel × event preference matrix | extends E2a |
| E2c — email digest | SES, templates, cadence / quiet-hours / timezone, unsubscribe, bounce | needs SES (not on Railway+Neon) |
| E2d — Slack / Teams | OAuth app, admin secrets config | needs external app registration |

E2c and E2d are blocked on infra that does not exist yet. E2a is the foundation the other three hang off, and the only piece buildable now.

## Scope & boundaries

**In scope:** a `notifications` table; synchronous best-effort generation on four events; a bell + unread badge + dropdown panel + toast; mark-read / mark-all-read; @mention typeahead + chip rendering; a minimal in-app on/off preference per event type.

**Events that generate a notification:**

1. **`mention`** — author @-mentions a user in a comment.
2. **`comment`** — a new comment lands on a feature/doc the recipient collaborates on or authored.
3. **`reply`** — a reply lands in a thread the recipient started or participated in.
4. **`project_invite`** — a user is invited to a project (see boundary below).

**Explicit boundaries — places the plain feature name promises more than E2a delivers. Approved consciously:**

- **Dashboard stays live-derived.** `apps/api/src/routes/dashboard.ts` `nextActions` continue to query live state (in_review docs, missing dates, open comments). The bell is a **separate surface**. E2a does **not** wire notifications into the dashboard; that cross-link is E3 / E2b. This diverges from the `BACKLOG.md` E3 line "next actions derived from notifications" — deferred deliberately.
- **`project_invite` notifies almost nobody in E2a.** Invites are email + TTL based (`apps/api/src/routes/invites.ts`); the invitee usually has **no account yet**, so there is no `userId` to receive an in-app notification. This event fires **only when the invited email matches an existing user account**. The channel that reaches strangers is E2c (email), deferred.
- **Create-only mentions.** Editing an existing comment to add a new @mention does **not** fire a notification in E2a (YAGNI; revisit in E2b).
- **Single in-app channel only.** Preferences are a 4-row on/off for the in-app channel. The full channel × event matrix (email/Slack columns) is E2b — those channels do not exist yet.

## §2 Schema — `notifications` (migration 0016)

```
notifications
  id          uuid pk default gen_random_uuid()
  userId      uuid not null  -> users(id)      on delete cascade   -- recipient
  projectId   uuid not null  -> projects(id)   on delete cascade   -- scope + cleanup
  kind        text not null  -- 'mention' | 'comment' | 'reply' | 'project_invite'
  actorId     uuid           -> users(id)      on delete set null  -- who triggered (null = system)
  featureId   uuid           -> features(id)   on delete cascade   -- deep-link target
  documentId  uuid           -> documents(id)  on delete cascade
  commentId   uuid           -> comments(id)   on delete cascade   -- source comment
  payload     jsonb          -- snippet, projectSlug, titles: render list without joins
  readAt      timestamptz    -- null = unread
  createdAt   timestamptz not null default now()

  index (userId, readAt)              -- unread-count query
  index (userId, createdAt desc, id)  -- list pagination
```

- A `kind` CHECK constraint enforces the four allowed values.
- ON DELETE CASCADE on `userId`, `projectId`, `featureId`, `documentId`, `commentId` means deleting any referenced entity auto-cleans its notifications. `actorId` is SET NULL (preserve the notification if the actor's account is removed).
- `payload` denormalizes the fields the list UI renders (project slug, feature/doc title, comment snippet) so the list endpoint needs no joins.

### `notification_mutes` (same migration)

```
notification_mutes
  userId  uuid not null -> users(id) on delete cascade
  kind    text not null  -- same four values
  primary key (userId, kind)
```

Default-on model: **presence of a row means the kind is muted**. An empty table = everything on. E2b widens this to the matrix by adding a `channel` column to the primary key.

## §3 Generation — `apps/api/src/lib/notifications.ts`

A new module, sibling to `lib/activity.ts`. Two entry points, both **best-effort**: wrapped in try/catch, log on failure, **never throw** — mirrors `recordActivity`. Called **after the triggering row is committed**, so a notification failure can never roll back or 500 the originating write.

### `fanOutCommentNotifications(comment, projectId)`

Called from `routes/comments.ts` after the comment insert commits (the insert is at `comments.ts:113`).

1. **Parse** `@[name](userId)` tokens from `comment.body` → candidate mentioned userIds.
2. **Re-resolve** every candidate id against `memberships` for `projectId`. Drop any id that is not a current member. **Never trust a userId embedded in the 4000-char body** (same guard as E5 public intake). Fan-out uses the resolved userId only; the embedded label is display-only.
3. **Build recipients:**
   - mentioned = resolved member ids from step 2
   - collaborators = `featureCollaborators` for the comment's feature (covers feature + doc comments)
   - participants = (only if the comment has a `parentId`) distinct authors in the same thread
4. **Remove the actor** (`comment.authorId`) from all sets — never self-notify.
5. **Load mutes** for all candidate recipients in one query; drop a recipient for a kind they have muted.
6. **Dedup precedence** — one notification per recipient per comment: `mention` > `reply` > `comment`. A recipient who is both mentioned and a collaborator gets a single `mention`.
7. **Bulk insert** the resulting rows with denormalized `payload`.

### `fanOutInviteNotification(invite)`

Called from `routes/invites.ts` after the invite is created.

1. Look up a user by the invited email.
2. If a user exists and has not muted `project_invite`, insert one `project_invite` notification. Otherwise no-op.

## §4 Routes — `apps/api/src/routes/notifications.ts`

All routes `requireAuth` and self-scoped: every query is filtered `userId = caller`. Cross-user access returns 404, never another user's data.

```
GET  /notifications?cursor=        -> paginated list, newest first, rendered from payload
GET  /notifications/unread-count   -> { count }
POST /notifications/:id/read       -> mark one read (caller's own only; else 404)
POST /notifications/read-all       -> mark all the caller's unread rows read

GET  /notifications/prefs          -> { mention: bool, comment: bool, reply: bool, project_invite: bool }
                                       (derived: true for every kind absent from notification_mutes)
PUT  /notifications/prefs          -> body { kind, enabled }; enabled=false inserts a mute row,
                                       enabled=true deletes it. Idempotent.
```

Pagination: cursor over `(createdAt desc, id)`, fixed page size. List rows render entirely from `payload` + stored columns — no joins.

## §5 Frontend — `apps/web`

- **`useNotifications` hook** — polls `GET /notifications/unread-count` every ~45s and on route change. Diffs the newest id/count against last-seen; new arrivals fire a toast. Exposes unread count + a fetch-list action.
- **Bell** in the app header with an unread badge (hidden at 0).
- **Dropdown panel** — list with unread emphasized; row click marks-read and navigates to the deep link (feature/doc/comment); a "Mark all read" action.
- **Mention typeahead** in the comment composer — on `@`, queries the existing `GET /projects/:projectId/members` (`projects.ts:83`), shows member name + color; selecting one inserts an `@[name](userId)` token into the body.
- **Chip rendering** in comment display — parse `@[name](userId)` tokens; **re-resolve the label from the member list** (token label is display-only); render as a chip. Unknown/non-member ids render as plain text.
- **Settings tab — Notifications** — four toggles (mention, comment, reply, project invite) for the in-app channel, backed by `GET/PUT /notifications/prefs`. Default all on.
- **Toast** — reuse an existing toast component if one exists; otherwise a minimal one.

## §6 Testing — mirror `apps/api/src/routes/comments.test.ts`

Generation (`lib/notifications.ts`):

- @mention of a project member → that member gets a `mention`.
- New comment on a feature → collaborators (minus author) get `comment`.
- Reply in a thread → prior participants (minus author) get `reply`.
- Dedup precedence: a user both mentioned and a collaborator gets exactly one `mention`, not two rows.
- Never-self: the comment author never receives a notification for their own comment.
- **Client-forged userId** in the body that is not a project member → dropped, no notification.
- Muted kind → recipient gets no notification for that kind; other kinds still fire.

Invite:

- Invited email matching an existing user → one `project_invite`.
- Invited email with no account → no notification.

Best-effort:

- A notification insert failure does **not** fail or roll back the comment write.

Routes:

- `unread-count` reflects unread rows only.
- list pagination over the cursor.
- mark-read on another user's notification → 404; own → marks read.
- `read-all` clears only the caller's unread rows.
- `GET/PUT /prefs` round-trip; muting then unmuting restores default-on.
- Unauthenticated → 401 on every route.

## Out of scope (later slices)

- Email / Slack / Teams channels, digests, quiet hours (E2c, E2d).
- Follow ≠ favorite; full channel × event preference matrix (E2b).
- Wiring notifications into the dashboard `nextActions` (E3 / E2b).
- Notifications on comment **edit** that adds a mention (revisit E2b).
- Real-time SSE push (chose 45s poll + on-nav).

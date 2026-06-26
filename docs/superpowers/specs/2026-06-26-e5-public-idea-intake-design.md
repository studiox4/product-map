# E5 — Public idea intake form (per project, unauthenticated)

**Status:** Approved (brainstorm) — 2026-06-26
**Backlog:** `BACKLOG.md:49`
**Depends on:** E1 (share tokens, project scoping) · existing idea inbox (`ideas` table, Inbox UI) · E2a notifications

## Goal

A per-project public form where **anyone — no login** — submits an idea that lands in
that project's idea inbox for triage. Turns the roadmap into a two-way channel without
giving submitters accounts. Reuses the E1 public share-token machinery with a new
`intake` token kind.

## Scope decisions (locked in brainstorm)

| Decision | Choice |
|----------|--------|
| Moderation | Per-project toggle, **default ON** (held submissions wait for approval) |
| Bot defense (v1) | Honeypot field + per-IP/per-token rate-limit only (no CAPTCHA) |
| Submitter contact | Optional name + email |
| Token model | Reuse `share_tokens`, `kind='intake'` |
| Config placement | **Per-token** (`config jsonb` on the token) — accepted deviation from spec's "per-project"; v1 assumes one active link per project |
| Notification | Notify owners/editors **on held (pending) submission** |

## Non-negotiable invariants (carried from the #23 review lessons)

1. **The submit POST is the security boundary — it independently re-validates the token.**
   The handler MUST re-check `revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now())`
   before inserting, returning the same opaque 404 as the meta GET. Never trust that the
   client loaded a valid form; a revoked/expired link must reject direct POSTs.
2. **Moderation fails closed.** Missing/absent token config ⇒ `moderation = true` (held).
   A token can never default to publishing straight to the inbox.
3. **`projectId` always comes from the token, never the client.** Strict project scoping,
   mirroring the E1 share read path.
4. **Submitter contact is unauthenticated PII and is never serialized on any public/share
   payload.** Ideas are served today only on membership-gated routes; intake public routes
   are write-only (submit) or PII-free (meta). If ideas ever feed a public read path,
   `submitterName`/`submitterEmail` are stripped server-side.
5. **`pending` ideas are excluded from every default (all-status) read.** Only an explicit
   `?status=pending` query surfaces them.

## Data model

### `ideaStatusEnum` — add `'pending'`
Current: `inbox | triaged | promoted | archived`. Add `pending` (a held public submission).
- Approve: `pending → inbox`
- Reject: `pending → archived`

Migration adds the enum value. **Enum sync:** `IDEA_STATUSES` (the `?status=` allow-list)
and the default-exclusion list must update in lockstep. Derive the default-list query from
`enum − 'pending'` rather than hardcoding a parallel array, to avoid the type-drift class
the #23 review flagged.

### `ideas` — add columns
- `submitterName text` (nullable)
- `submitterEmail text` (nullable)
- Public submissions set the existing `source` column to `'public'` and `createdBy = null`.

### `share_tokens` — intake support
- `kind` already free-text → `'intake'`.
- Add `config jsonb` typed `$type<IntakeConfig>()`, nullable.
  `IntakeConfig = { introMd: string; moderation: boolean }`.
- `sections` (roadmap-only) stays null for intake tokens. **Mint enforces
  sections-XOR-config by kind** so a row can't carry both — closes the illegal-cross-kind-
  state smell the #23 type review flagged.

### Notifications — new kind `idea_submitted`
- Add `'idea_submitted'` to `NOTIFICATION_KINDS` (`packages/shared/src/constants.ts`) **and**
  to the schema's `kind` CHECK constraint (migration).
- A held submission fans out to project owners + editors: `actorId = null` (public, no
  actor), `payload = { ideaId, title }`. Best-effort try/catch (swallow + log), respects
  existing mutes — same pattern as `fanOutInviteNotification`.

## API routes

### Mint (authed, editor-gated) — mirrors `share/roadmap`
`POST /api/projects/:projectId/share/intake`
- Body: `{ introMd?: string, moderation?: boolean, expiresInDays?: 7|30|90|null }`
  (`moderation` defaults `true`; reuses E1 expiry union).
- Inserts `share_tokens` row `kind='intake'`, `config={introMd, moderation}`.
- Returns `{ url: '/p/<token>/submit', expiresAt }`.
- Revoke reuses the existing `DELETE /api/share/:token` (token kind-agnostic).

### Public meta (unauthenticated, read)
`GET /api/intake/:token`
- Returns `{ projectName, introMd, active: true }`.
- 404 (opaque) on revoked / expired / unknown — no enumeration leak, no PII, no ideas.

### Public submit (unauthenticated, write)
`POST /api/intake/:token`
- **Re-validates token** (invariant 1) before anything else.
- `zValidator('json', intakeSubmit)` — bounded lengths: `title` (1–200), `bodyMd` (0–5000),
  `submitterName` (0–100), `submitterEmail` (0–200, email format if present),
  `website` (honeypot, must be empty).
- **Honeypot:** non-empty `website` ⇒ return 201 `{ok:true}` and silently drop (looks
  accepted to a bot).
- **Rate-limit:** per-IP (e.g. 5/min) **and** per-token (e.g. 20/hr) via the existing
  `RateLimiter` + `clientIp`. Trip ⇒ 429. (Caveat: limiter is per-process; on multi-instance
  Railway it is best-effort per instance, not a hard global cap — acceptable for v1.)
- Insert idea: `projectId` from token, `source='public'`, `createdBy=null`,
  `status = config.moderation ? 'pending' : 'inbox'`, contact stored if given.
- If held (`pending`), fan out the `idea_submitted` notification.
- Returns 201 `{ ok: true }` — opaque, no idea id leaked.

### Inbox moderation (authed, editor)
Approve/reject reuse the existing idea status PATCH path: `pending→inbox` (approve),
`pending→archived` (reject).

### `app.ts` public allow-list
Add `/api/intake/*` (GET meta + POST submit) to the public-route allow-list alongside the
existing share GET. **Precision:** only the meta GET and submit POST live under the public
`/api/intake/` prefix; mint stays under the authed `/api/projects/:id/share/intake`.

## Web

### Public page `/p/:token/submit`
- Bare page, **no app shell**, noindex meta injected at runtime (reuse the SharePage
  pattern); `robots.txt` already disallows.
- Sibling of `/share/:token` in `App.tsx` (outside the active-project shell).
- Fetches meta → renders intro copy + form: title, description, optional name/email, hidden
  honeypot. States: form, submitting, success ("thanks — your idea was received"),
  inactive-link ("this form isn't active").

### Settings
Extend `SharingBlock` (or a sibling `IntakeBlock`): mint/revoke the intake link, copy URL,
intro-copy textarea, moderation toggle, optional expiry.

### Inbox
- "Pending review (N)" tab querying `?status=pending`.
- Approve / reject buttons on pending ideas.
- `source=public` badge; submitter name/email shown on the detail pane (authed view only).

## Testing

**API**
- Mint intake token (editor) → 201; non-editor → 403.
- Meta GET: active → 200; revoked/expired/unknown → opaque 404.
- **Submit re-validates token:** revoked/expired token POST → 404 even with a valid body
  (invariant 1 regression test).
- Submit with moderation ON → idea `status='pending'`, excluded from default list, present
  under `?status=pending`; fires `idea_submitted` notification to owners/editors.
- Submit with moderation OFF → `status='inbox'`, appears in default list, no held
  notification.
- Fail-closed: token with null/absent config ⇒ treated as moderation ON.
- Honeypot non-empty ⇒ 201 but no idea row created.
- Rate-limit: exceeding per-IP/per-token cap ⇒ 429.
- Project scoping: idea always lands in the token's project regardless of any client-sent id.
- Contact PII never appears on any public payload.
- Approve (`pending→inbox`) and reject (`pending→archived`) transitions.

**Web**
- Public page renders form + intro; success and inactive states.
- noindex meta injected on mount, removed on unmount (reuse SharePage test pattern).
- Honeypot field present and hidden.
- Inbox pending tab lists pending ideas; approve/reject calls fire.

## Out of scope (v1 / YAGNI)
- CAPTCHA / Turnstile (honeypot + rate-limit only; add if abused).
- Project-configurable custom extra fields (title + description + contact only).
- Emailing submitters on status change (needs E2c email channel).
- Per-project (vs per-token) config unification.

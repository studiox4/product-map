# Phase 1 — Authentication & Identity — Design

**Date:** 2026-06-16
**Status:** Approved design. Next step: writing-plans → implementation.
**Parent:** `2026-06-16-open-source-roadmap-design.md` (Phase 1, the keystone).
**Build-order note:** The roadmap places the mechanical `products → projects` rename in Phase 0. This auth design does not depend on it; it can be specced and built independently. Per-project roles and membership are **Phase 2** — Phase 1 introduces only an instance-level `admin | member` role.

---

## 1. Goal

Replace the demo identity model (no passwords; `x-user-id` header resolved to a user row, falling back to the first seeded user) with real authentication: email + password accounts, signed-cookie sessions, instance roles, and revocation. Preserve the offline / air-gapped ethos — every external dependency (OAuth, SMTP) stays optional and env-gated, with a working local fallback.

## 2. Current state (verified 2026-06-16)

- **No auth.** `apps/api/src/middleware/current-user.ts` resolves `x-user-id` to a user row on mutating requests only, falling back to the first user by `createdAt`. GET/HEAD/OPTIONS skip resolution entirely.
- **Client identity** (`apps/web/src/lib/api.ts`): a `pmUserId` in `localStorage` is sent as the `x-user-id` header (`userIdHeaders`). `useMe()` resolves it against `GET /api/users`. `WelcomeDialog.tsx` is the "login" — asks a name, `POST /api/users`, stores the id; silently adopts the first user if any exist.
- **Blast radius:** `currentUser` is consumed in **11 route files** (`evidence, comments, ideas, plans, objectives, templates, features, releases, documents, deps, decisions`). All assume an always-present actor.
- **`users` table:** `{ id, name, color, createdAt }` — no email, no password.
- **`GET /api/users`** returns full rows; once secrets are added it must be scrubbed.
- **Share** (`/api/share/*`) is intentionally unauthenticated and must stay public (`useShareData` deliberately sends no identity header).
- **`admin.ts`:** dev-only `POST /admin/reset-demo`, prod-blocked.
- **Tests:** `apps/api/src/test/helpers.ts` provides `setupTestDb` / `truncateAll` / `closeTestDb`; route tests assume the fallback actor. e2e assumes an always-present user.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Session transport | **Stateless signed JWT in an httpOnly cookie** (no sessions table). |
| Revocation strategy | **Short access token + refresh token with a `token_version` check** (see §4). Chosen to close the "deactivated user keeps access" gap without a per-request DB read. |
| Registration policy | **First registration becomes `admin`.** Afterward, open self-signup is OFF by default; `ALLOW_OPEN_SIGNUP=true` enables it. Admin can create users directly. Full invite flow is Phase 2. |
| Password hashing | **argon2id.** |
| OAuth | **Deferred to Phase 1.5** — design an OAuth-ready seam now, build GitHub/Google later. |
| Password hashing lib / JWT lib | argon2id via a maintained native binding; JWT via `jose` (ESM, well-maintained). Final package choice at implementation. |

## 4. Token & session model

Two tokens, both httpOnly + `Secure` (prod) + `SameSite=Lax` cookies.

**Access token — cookie `pm_session`, Path `/`, exp 15 min.**
- Claims: `sub` (userId), `role` (`admin|member`), `tv` (token_version), `iat`, `exp`.
- Verified on every request: **signature + expiry only. No DB read.** This is the stateless hot path.

**Refresh token — cookie `pm_refresh`, Path `/api/auth/refresh`, exp 30 days.**
- Claims: `sub`, `tv`, `iat`, `exp`.
- On `POST /api/auth/refresh`: read the user row, require `is_active = true` **and** `token_version == tv`. If valid, mint a new access token (and rotate the refresh token). This is the only place that reads the user for auth — roughly once per 15 min, not per request.

**Revocation** = bump `users.token_version`. Triggered by: change-password, admin deactivate, "log out everywhere". Effect: refresh fails on next attempt; the outstanding access token expires within ≤15 min. Emergency global revocation = rotate `AUTH_SECRET` (invalidates all tokens).

**Logout** = clear both cookies (single device). **Logout-everywhere** = bump `token_version`.

## 5. Data model (migration)

Add to `users`:
- `email text` — stored lower-cased; unique index. Nullable only to accommodate pre-existing demo rows on upgrade (new accounts always set it).
- `password_hash text` — argon2id; nullable (OAuth-only accounts in 1.5; pre-existing rows).
- `role` — enum `admin | member`, default `member`. **Instance role only**; project roles are Phase 2.
- `token_version integer not null default 0`.
- `is_active boolean not null default true`.

Keep `name`, `color`, `createdAt`. No sessions table (stateless).

**Upgrade note:** existing demo users have no `email`/`password_hash` and cannot log in until an admin sets a password or they re-register. Document in CHANGELOG / an UPGRADE note. Fresh installs are unaffected (seed is dev-only).

## 6. API — `/api/auth`

| Endpoint | Behavior |
|---|---|
| `POST /register` | `{ email, password, name }`. If zero users exist → create as `admin`. Else require `ALLOW_OPEN_SIGNUP=true`, create as `member`, else `403`. Sets both cookies. Validates password policy. |
| `POST /login` | `{ email, password }` → verify argon2id → set cookies. Generic `401 invalid_credentials` on any failure (no user enumeration). |
| `POST /logout` | Clear both cookies. `204`. |
| `POST /refresh` | Validate refresh cookie + `token_version` + `is_active` → rotate tokens. `401` otherwise. |
| `GET /me` | Current user (id, name, color, role). Replaces client `useMe` over `/api/users`. |
| `POST /change-password` | `{ currentPassword, newPassword }` → verify, re-hash, **bump `token_version`**, re-issue caller's cookies. |

**Optional (env-gated, stretch):** `POST /forgot` + `POST /reset` behind SMTP config. Air-gapped fallback = admin sets/reset password via the admin API. Not required for Phase 1 completion.

**Phase 1.5 seam (not built now):** `GET /oauth/:provider` + `GET /oauth/:provider/callback`; `password_hash` already nullable to allow OAuth-only accounts.

## 7. Admin user management (minimal, Phase 1)

Extend `admin.ts` (all `requireAdmin`):
- `GET /api/admin/users` — list (scrubbed: no hash).
- `POST /api/admin/users` — create `{ email, name, role }` with a temporary password (returned once / printed); user changes it on first login.
- `PATCH /api/admin/users/:id` — set `role`, `is_active` (deactivate bumps `token_version`), reset password.

Full invite-by-link / by-email flow is Phase 2.

## 8. Middleware rewrite (the breaking change)

- **`requireAuth`** replaces `current-user.ts`: read `pm_session`, verify, attach `currentUser` (no DB read); `401` if absent/invalid. **Applies to all `/api/*` including GETs** — today GETs skip auth; Phase 1 closes that.
- **Public allowlist** (no auth): `GET /api/healthz`, `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/refresh`, all of `/api/share/*`.
- **`requireAdmin`**: requires `role = admin`; guards `/api/admin/*`.
- Remove the "fallback to first user" path everywhere. The 11 consuming routes keep using `c.get('currentUser')`, now guaranteed non-null behind `requireAuth`.

## 9. Security requirements

- **argon2id** with sensible memory/time params (tuned at implementation).
- **`AUTH_SECRET`** signs tokens. **Required in production — boot fails if unset.** Dev generates an ephemeral secret with a loud warning (tokens won't survive restart — acceptable in dev).
- **Rate limiting** on `login`, `register`, `refresh`: in-memory token bucket keyed by IP. Document the multi-instance caveat (per-process limit; a shared store is a later concern).
- **CSRF:** `SameSite=Lax` cookies + an Origin/Referer check on all mutating requests (reject cross-origin). Same-origin app, so no token plumbing needed; document the decision.
- **No secret leakage:** `GET /api/users` and any user serialization return only `{ id, name, color, role }`. `email`/`password_hash`/`token_version` never serialized.
- **No user enumeration:** login and forgot-password return generic responses regardless of whether the email exists.
- **Password policy:** minimum length (≥10) enforced in the shared zod schema; no maximum that blocks passphrases.

## 10. Web changes

- **Cookie auth:** requests use `credentials: 'include'` (same-origin → automatic). **Remove** `pmUserId`, `getStoredUserId`, `setStoredUserId`, `userIdHeaders`, and the `x-user-id` header from `lib/api.ts`.
- **Routes:** add `/login` and `/register`; gate the app behind auth; unauthenticated → redirect to `/login`. (App stays at `/` in Phase 1; the `/app` move is Phase 3.)
- **Replace `WelcomeDialog`** with login/register pages.
- **Auth context/provider:** loads `GET /api/auth/me`; on `401`, attempt one `POST /api/auth/refresh` then retry, else redirect to `/login`. `useMe()` reads `/api/auth/me`.
- **ProfileTab:** add change-password.
- **Admin settings:** minimal user-management UI (list, create, deactivate, reset password) gated to `admin`.

## 11. Tests / dev DX

- **API test helper:** add `createTestUser({ role })` and `authCookie(user)` (mint a valid access JWT) / a `withAuth` request wrapper. Update all route tests to attach auth. `truncateAll` already covers `users`; no sessions table to clear.
- **Dev seed:** create an admin with known credentials (from env or printed to console on seed) so `pnpm dev` is never locked out; optionally a dev-only auto-login.
- **e2e:** add a login step (or a seeded session bootstrap) before existing flows.
- **New tests:** register (first-user-admin vs gated signup), login (success/failure/enumeration), refresh + `token_version` revocation, `requireAuth` gating (401 on protected GET), `requireAdmin`, password change → old token rejected after ≤ access TTL, user serialization scrubbing, rate-limit trip, Origin-check rejection.

## 12. Out of scope (Phase 1)

- OAuth (GitHub/Google) → **Phase 1.5**.
- Per-project roles & membership, invites → **Phase 2**.
- SMTP password reset → optional/stretch within Phase 1, not required for completion.
- App move to `/app`, public marketing landing → **Phase 3**.

## 13. Acceptance criteria

1. No request is ever attributed to a fallback user; unauthenticated access to any non-allowlisted `/api/*` returns `401`.
2. First registration creates an `admin`; subsequent self-signup is refused unless `ALLOW_OPEN_SIGNUP=true`.
3. Login sets cookies; sessions persist across reloads; logout clears them.
4. Deactivating a user or changing a password invalidates existing sessions within ≤15 min (refresh fails immediately).
5. `AUTH_SECRET` unset in production prevents boot.
6. `GET /api/users` never exposes `email` or `password_hash`.
7. Auth endpoints are rate-limited and reject cross-origin mutations.
8. Share links continue to work unauthenticated.
9. Full unit + e2e suites pass with the new auth-aware helpers.

## 14. Open questions (resolve during planning/implementation)

- argon2id parameters and the specific argon2 + jose package versions.
- Whether dev auto-login is worth the code vs just printing seeded admin credentials.
- Exact access/refresh lifetimes (15 min / 30 days proposed) and refresh-rotation reuse-detection (defer reuse-detection unless cheap).
- Password-reset: ship the optional SMTP flow in Phase 1 or defer entirely to a later pass.

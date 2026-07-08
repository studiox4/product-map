# Railway one-click deploy + template gallery listing

Status: approved, ready for implementation plan
Sub-project 1 of 4 in the "traction" initiative (Railway deploy → discovery polish → contributor readiness → launch push).

## Goal

Get ProductMap into the Railway template gallery as a true one-click deploy: click the button, get a running instance with its own database, no required manual env-var wiring. Optional upgrades (Neon DB swap, real outbound email via Resend) are documented, one-line changes for anyone who wants them.

## Context

- `railway.json` already exists at the repo root (Nixpacks build, migrate-on-deploy, healthcheck) — used for the existing `product-map-production` demo deploy on Railway + Neon.
- `apps/api/.env.example` already documents every env var the app reads.
- Mail sending today is SMTP-only (`apps/api/src/lib/mailer.ts`, via `nodemailer`, lazily imported so it stays an optional dependency). **Railway blocks outbound SMTP ports on non-Pro plans**, so SMTP-only mail would silently fail to send on a template-deployed instance.
- `productmap-cloud` (private repo) is unrelated to this — this work is entirely in the public core repo.

## Architecture

### 1. Database: Railway-native Postgres by default, Neon as a documented swap

Railway templates don't support a deploy-time "choose your DB" toggle — a template's services are fixed at compose time. So the template bundles the safest default and documents the alternative:

- **App** — this repo, built via the existing `railway.json` (Nixpacks, `pnpm --filter @productmap/web build`, `pnpm --filter @productmap/db migrate` pre-deploy, `pnpm --filter @productmap/api exec tsx src/index.ts` start).
- **Postgres** — Railway's own native Postgres plugin (not Neon). Zero signup, zero claim step, no expiry — the actual bar for "one-click." `DATABASE_URL` on the app service is wired via a Railway reference variable pointing at the Postgres service — no manual copy-paste.

**Neon as an optional swap**, documented in the README/post-deploy notes: anyone who wants Neon's serverless scale-to-zero can create a free Neon project and paste its connection string over `DATABASE_URL` in the Railway Variables tab — a one-line env var edit, no redeploy of the template needed, no code change required since `DATABASE_URL` is already just a Postgres connection string either way. This avoids Neon's claimable-DB 72-hour expiry window being the default experience for every deployer, while still giving power users the option.

### 2. Email: native Resend HTTP transport (new code)

Add Resend as a first-class mail transport alongside the existing SMTP one, since Resend's HTTPS API works on every Railway plan (SMTP does not).

**`apps/api/src/config.ts`:**
- Replace `smtp: SmtpConfig | null` on `AppConfig` with `mail: MailConfig | null`, a discriminated union:
  ```ts
  type MailConfig =
    | { kind: 'resend'; apiKey: string; from: string }
    | { kind: 'smtp'; host: string; port: number; user?: string; pass?: string; from: string };
  ```
- Precedence in `loadConfig()`: `RESEND_API_KEY` set → `resend`; else `SMTP_HOST` set → `smtp`; else `null` (existing air-gapped/link-only fallback, unchanged behavior).
- New env vars: `RESEND_API_KEY` (enables the Resend path), `RESEND_FROM` (defaults to the same pattern as today's `SMTP_FROM` default).
- Existing `SMTP_*` vars are untouched — self-hosters who already run their own SMTP keep working exactly as today.

**`apps/api/src/lib/mailer.ts`:**
- `createMailer` takes `MailConfig | null` instead of `SmtpConfig | null`.
- Add a Resend transport: a plain `fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer <apiKey>', 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, subject, text, html }) })`. No new dependency — Node ≥18 has global `fetch`, matching the existing "keep third-party mail deps optional" spirit (nodemailer is still lazily imported and only touched on the `smtp` path).
- `send()` picks transport by `mail.kind`; both paths return the existing `boolean` "was a send attempted" contract. A non-2xx Resend response logs and returns `false`, same shape as today's `info.rejected` handling for SMTP.
- Existing unit tests for the SMTP path (`mailer.test.ts`) stay green with an injected fake transport; add equivalent coverage for the Resend path with a mocked `fetch`.

### 3. Template env-var defaults (set in Railway's Template Composer, not in files)

Railway templates are authored in Railway's dashboard against this GitHub repo — the composer step itself is a manual, one-time action taken outside this repo (Railway account required). This spec covers everything file-based; the composer step is documented as a runbook for whoever publishes the template.

Defaults to set in the composer:

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | Railway Postgres reference variable | auto-wired, not user-entered; swappable to a Neon connection string post-deploy for anyone who wants it |
| `AUTH_SECRET` | `${{secret(32)}}` | Railway's built-in random-value generator |
| `NODE_ENV` | `production` | hardcoded |
| `SERVE_WEB` | `1` | hardcoded |
| `TRUST_PROXY` | `1` | hardcoded — Railway terminates TLS in front of the app |
| `APP_URL` | `${{RAILWAY_PUBLIC_DOMAIN}}` (with `https://` prefix) | auto-filled |
| `ALLOW_OPEN_SIGNUP` | `1` | deployer needs to self-register the first (admin) account with no invite step; template's post-deploy notes tell them to flip to `0` afterward |
| `RESEND_API_KEY` | *(unset by default — optional field)* | Deploy works with zero fields filled in: no email configured means invites fall back to shareable links (existing air-gapped behavior), so this is a true zero-input one-click deploy. Template UI labels it "Optional: turn on real invite emails later — get a free key at resend.com/api-keys, and note a fresh key can only email your own account until you verify a sending domain in Resend." |
| `RESEND_FROM` | *(user-entered, optional)* | only relevant if `RESEND_API_KEY` is set; falls back to a `productmap.local` placeholder if left blank |

### 4. README

Add a Railway deploy button (`https://railway.com/button.svg`) near the top of `README.md`, linking to the published template URL. This slots in right after the existing badges/before the current demo link — will be filled in with the real template URL once it's published (chicken-and-egg: the button can't exist until the template is composed and published, so this is the last file change in the implementation, done after the manual composer step).

## Implementation notes (verify before building)

- **Railway template variable syntax** — `${{secret(32)}}` and `${{RAILWAY_PUBLIC_DOMAIN}}` are the right shape but must be confirmed against current Railway template-variable docs before use in the composer; the exact function tokens have changed over time.
- **`RAILWAY_PUBLIC_DOMAIN` timing** — confirm this resolves at deploy time (not only after first boot). If it's only available post-boot, `APP_URL` will be wrong on the very first deploy and invite links will be broken until a redeploy — needs a workaround if so (e.g. a documented manual redeploy step, or a boot-time domain lookup).
- **Deploy button URL/asset** — confirm the current Railway deploy-button image URL and template deploy-link format before wiring the README (has been `railway.app` and `railway.com` at different times).
- **`config.smtp` → `config.mail` refactor** — grep every reader of `config.smtp` (at least `routes/projects.ts`, per current usage) before renaming, so the discriminated-union refactor doesn't miss a caller.

## Testing

- New unit tests for the Resend transport path in `mailer.test.ts` (mocked `fetch`, success + non-2xx cases).
- Existing SMTP-path tests continue to pass unmodified in behavior (only the config shape changes from `smtp` to `mail.kind === 'smtp'`).
- Manual end-to-end: deploy the actual template from a fresh Railway project once composed, confirm app boots against the bundled Railway Postgres, DB migrates, invites work as shareable links with no `RESEND_API_KEY` set. Separately verify the Neon-swap path (paste a Neon connection string over `DATABASE_URL`, confirm the app reconnects) and the Resend path (set `RESEND_API_KEY`, confirm an invite email round-trips).

## Out of scope

- Railway Template Gallery submission/review process itself (Railway's approval flow) — this spec delivers everything needed to submit, but the submission and any Railway-side review is a manual step outside this repo.
- The SMTP→Resend Gateway sidecar approach (rejected in favor of native Resend transport).
- Any change to `productmap-cloud` (private repo) — unaffected.
- Sub-projects 2–4 (discovery polish, contributor readiness, launch push) — separate specs.

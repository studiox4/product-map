# Publishing the ProductMap Railway template

Manual runbook — requires a Railway account. Not scriptable from this repo.

## Before you start

Verify these against Railway's current docs before proceeding — template
variable syntax and the deploy-button asset URL have changed over time:
- Railway template variable functions: https://docs.railway.com/guides/templates
- Whether `RAILWAY_PUBLIC_DOMAIN` resolves at deploy time or only after first
  boot. If it's only available post-boot, the first deploy's `APP_URL` will
  be wrong until a manual redeploy — note this in the template's post-deploy
  instructions if so, or find the current recommended workaround.
- The current deploy-button image URL and template deploy-link format.

## Steps

1. In the Railway dashboard, start a new Template from this GitHub repo
   (`studiox4/product-map`, `main` branch).
2. Add two services to the template:
   - **App** — points at this repo, uses the existing `railway.json` (no
     changes needed — Nixpacks build, migrate-on-deploy, healthcheck already
     configured).
   - **Postgres** — Railway's native Postgres plugin (NOT Neon/Instagres —
     see `docs/superpowers/specs/2026-07-08-railway-one-click-deploy-design.md`
     for why: no signup/claim/expiry, the actual bar for one-click).
3. Wire `DATABASE_URL` on the App service to a reference variable pointing at
   the Postgres service's connection string.
4. Set these template variable defaults on the App service:
   - `AUTH_SECRET` = `${{secret(32)}}` (verify this exact function syntax first)
   - `NODE_ENV` = `production`
   - `SERVE_WEB` = `1`
   - `TRUST_PROXY` = `1`
   - `APP_URL` = `${{RAILWAY_PUBLIC_DOMAIN}}` with an `https://` prefix (verify
     timing per the "Before you start" note above)
   - `ALLOW_OPEN_SIGNUP` = `1`
   - `RESEND_API_KEY` = leave unset, mark optional, label: "Optional: turn on
     real invite emails later — get a free key at resend.com/api-keys. Note: a
     fresh key can only email your own account until you verify a sending
     domain in Resend."
   - `RESEND_FROM` = leave unset, mark optional
5. In the template's description/post-deploy notes, document:
   - The app works immediately with zero fields filled in — invites are
     shareable links until `RESEND_API_KEY` is set.
   - How to swap `DATABASE_URL` to a Neon connection string instead, for
     anyone who wants Neon's serverless scale-to-zero.
6. Publish the template and copy its public URL.
7. Hand the URL to Task 6.

## Submitting to the Railway Template Gallery

Out of scope for this repo's plan — Railway's own submission/review process,
done from the dashboard after the template above is published and verified
working end-to-end.

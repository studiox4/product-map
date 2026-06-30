# @productmap/sdk — edition seams

Open seam contracts for the open-core edition. The free core ships these
interfaces + the CommunityProvider; the private paid edition implements them.

## Seams

- **Server plugins** (`server-plugins.ts`) — paid edition mounts Hono routes
  under `/api/ee/<name>` via `serverPlugins.add()` + `installServerPlugins(app)`.
- **Jobs** (`jobs.ts`) — `JobQueue` interface; core ships an in-process default.
- **Slots** (`slots.ts`) — `slotRegistry.register({ id, loader })`; the web
  `<Slot id>` lazy-renders the fill. Build-time composition only.
- **Entitlements** (`entitlements.ts`) — `EntitlementProvider`; `requireFeature`
  on the server is the real gate, `useEntitlement` on the client is UX-only.
  License **verification** ships here (`verifyLicense` via the **node-only**
  `@productmap/sdk/license` subpath — kept out of the main barrel so `node:crypto`
  never enters the web bundle). Verification is public; **signing keys and the
  key generator are private to the Team edition**. A paid edition's
  `LicenseKeyProvider` calls `verifyLicense(token, publicKeyPem)` and feeds the
  result into `createEntitlementProvider`.

  ### Entitlement scope: per-process (self-hosted, single-org)

  The entitlement provider is resolved per-process: `get()`, `can()`, and
  `limit()` take no tenant or request argument, and `setEntitlementProvider`
  sets a process-level singleton. This is intentional for the self-hosted Team
  edition, where one deployment serves one organisation. A future hosted
  multi-tenant edition would resolve entitlements per-request at a different
  layer (e.g. a request-scoped middleware that selects the right provider by
  tenant ID) and may add an optional context parameter to the
  `EntitlementProvider` contract at that time.
- **Migrations** — `@productmap/db`'s `migrateStream(db, { folder, table })`
  runs the paid `ee` stream on its own ledger. ee migrations are additive-only.

## Invariants

- The core boots and passes all tests with **zero plugins and zero slot fills**.
- No paid feature code lives in this repo — only seams.
- Server `requireFeature` is the enforcement boundary; never gate on the client alone.
- `ee` migrations never alter or drop core tables.

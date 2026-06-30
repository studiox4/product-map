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
- **Migrations** — `@productmap/db`'s `migrateStream(db, { folder, table })`
  runs the paid `ee` stream on its own ledger. ee migrations are additive-only.

## Invariants

- The core boots and passes all tests with **zero plugins and zero slot fills**.
- No paid feature code lives in this repo — only seams.
- Server `requireFeature` is the enforcement boundary; never gate on the client alone.
- `ee` migrations never alter or drop core tables.

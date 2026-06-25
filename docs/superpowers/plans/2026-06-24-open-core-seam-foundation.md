# Open-Core Seam Foundation (F1 + F2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the five extension seams to the public Apache-2.0 core — a server plugin registry, a background-jobs interface, a client slot registry, an entitlement gate, and migration namespacing — so the future private paid edition can attach without forking, while the core keeps booting and passing every test with zero paid code present.

**Architecture:** A new dependency-light `@productmap/sdk` package holds the seam *contracts* (interfaces + framework-agnostic registries) and the `CommunityProvider`. `apps/api`, `apps/web`, and `packages/db` wire those contracts into the running core at boot/render. Core registers zero plugins and zero slot-fills; every seam degrades to a no-op. No paid implementation is written here — only the seams and one fake plugin used in tests.

**Tech Stack:** TypeScript (strict, ESM, `moduleResolution: bundler`), pnpm workspaces, Hono 4 (api), React 18 + react-router + react-query + Vitest/jsdom + Testing Library (web), Drizzle ORM + node-postgres (db), Vitest (all).

## Global Constraints

Every task's requirements implicitly include this section. Copied verbatim from `docs/superpowers/specs/2026-06-24-open-core-edition-architecture-design.md`.

- **CORE BOOTS WITH ZERO PLUGINS.** The core must build, boot, and pass 100% of its existing tests with no paid packages and no registered plugins/slots. This is the load-bearing invariant — every task must preserve it.
- **NO PAID CODE IN THIS REPO.** This plan adds only *seams* (open) and test fakes. No AI/integrations/analytics/notification-delivery feature code, no Stripe, no license-signing private key.
- **DEMO PATH UNTOUCHED.** Do not change `apps/web/src/demo/*`, `/demo` route behavior, or the PGlite graph. If a change would affect demo, stop and flag it.
- **NO BEHAVIOR CHANGE TO EXISTING CORE.** The entitlement gate is *additive*: `CommunityProvider` exposes limits, but no existing core path may start enforcing a limit or hiding a feature as a result of this work. Existing routes, pages, and the demo behave identically.
- **SERVER GATE IS THE REAL GATE.** Client-side entitlement checks are UX-only. Any real paywall is a server-side `requireFeature` check. Never gate access on the client alone.
- **BUILD-TIME SLOT COMPOSITION, NOT A RUNTIME LOADER.** Slots are registered by static import at build time; do not build a runtime/network plugin loader (YAGNI until a third-party marketplace exists).
- **`ee` MIGRATIONS ARE ADDITIVE-ONLY.** The migration helper for the paid stream must never alter or drop core tables; it only adds its own objects, tracked in a separate table.
- **SEAM ID TYPES ARE A CONTRACT.** `Feature`, `LimitKey`, and `SlotId` union types are the public seam vocabulary. Extend them deliberately; never rename existing members.
- **Package versions:** match the repo — `hono@^4.6.14`, `drizzle-orm@^0.38.2`, `zod@^3.24.1`, `typescript@^5.7.2`, `vitest@^2.1.8`, React 18. New packages use `"type": "module"` and extend `tsconfig.base.json`.
- **Community free-tier caps (tunable product values, not enforced by core yet):** `projects: 3`, `members: 10`, `seats: 10`. `-1` means unlimited.
- **Test database:** api/db Postgres-backed tests need a running Postgres and are blocked by the command sandbox. Run them with the sandbox disabled (see `[[test-db-sandbox]]`). Default DB `productmap_test` at `postgres://localhost:5432`.

---

## File Structure

**New package `@productmap/sdk`** (`packages/sdk/`) — seam contracts, no heavy deps:
- `src/entitlements.ts` — `Feature`, `LimitKey`, `Entitlements`, `EntitlementProvider`, `createCommunityProvider`, `COMMUNITY_LIMITS`.
- `src/server-plugins.ts` — `ServerPlugin`, `PluginContext`, `createServerPluginRegistry`.
- `src/jobs.ts` — `Job`, `JobHandler`, `JobQueue` (interface + types only).
- `src/slots.ts` — `SlotId`, `SlotRegistration`, `createSlotRegistry`, `slotRegistry` (shared singleton).
- `src/index.ts` — re-exports.

**`apps/api`** (server wiring):
- `src/middleware/entitlements.ts` — module-level provider holder: `setEntitlementProvider`, `getEntitlements`, `requireFeature`.
- `src/lib/jobs.ts` — `createInProcessJobQueue()` default `JobQueue` impl.
- `src/plugins.ts` — `serverPlugins` registry singleton + `installServerPlugins(app, ctx)`.
- `src/app.ts` — MODIFY: reserve `/api/ee/*` 404 fallthrough only (no auto-install). `src/index.ts` — MODIFY: set community provider + install plugins at boot.

**`apps/web`** (client wiring):
- `src/lib/slots.tsx` — `<Slot id />` React component consuming `slotRegistry`.
- `src/lib/entitlements.tsx` — `EntitlementsProvider` context + `useEntitlement(feature)`, default community.
- `src/components/AppShell.tsx` — MODIFY: render one real mount point `<Slot id="nav.analytics" />`.

**`packages/db`** (migration namespacing):
- `src/migrate-stream.ts` — `migrateStream(db, { folder, table })`.

---

## Task 1: Scaffold `@productmap/sdk` package

**Goal:** A new workspace package that builds and is importable as `@productmap/sdk`, ready to hold seam contracts. Nothing else.

**Done when:** `pnpm --filter @productmap/sdk test` runs (one trivial passing test), `@productmap/sdk` resolves in tsconfig paths, and the root `pnpm -r build` still passes.

**Guardrails:** Do not add React, drizzle, pg, or node-only deps to this package — it must stay importable from both server and browser. Only `hono` (type-only) and `zod` are allowed deps.

**Files:**
- Create: `packages/sdk/package.json`, `packages/sdk/tsconfig.json`, `packages/sdk/src/index.ts`, `packages/sdk/src/smoke.test.ts`
- Modify: `tsconfig.base.json:14-21` (add `@productmap/sdk` paths)

**Interfaces:**
- Produces: the package `@productmap/sdk` (entry `src/index.ts`), consumed by all later tasks.

- [ ] **Step 1: Write the failing test**

```ts
// packages/sdk/src/smoke.test.ts
import { describe, it, expect } from 'vitest';
import * as sdk from './index';

describe('@productmap/sdk', () => {
  it('is importable', () => {
    expect(typeof sdk).toBe('object');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/sdk test`
Expected: FAIL — package/test runner not yet set up (no `vitest` script / missing files).

- [ ] **Step 3: Create the package files**

```json
// packages/sdk/package.json
{
  "name": "@productmap/sdk",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run" },
  "dependencies": { "zod": "^3.24.1" },
  "devDependencies": { "hono": "^4.6.14", "typescript": "^5.7.2", "vitest": "^2.1.8" }
}
```

```json
// packages/sdk/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "baseUrl": "." },
  "include": ["src"]
}
```

```ts
// packages/sdk/src/index.ts
// Seam contracts for the open-core edition. Implementations live in the
// private edition repo; the core ships only these interfaces + CommunityProvider.
export {};
```

Then add to `tsconfig.base.json` `paths` (after the templates entries):

```json
      "@productmap/sdk": ["packages/sdk/src/index.ts"],
      "@productmap/sdk/*": ["packages/sdk/src/*"]
```

- [ ] **Step 4: Install + run test to verify it passes**

Run: `pnpm install && pnpm --filter @productmap/sdk test`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/sdk tsconfig.base.json pnpm-lock.yaml
git commit -m "feat(sdk): scaffold @productmap/sdk seam-contracts package"
```

---

## Task 2: Entitlement contracts + CommunityProvider

**Goal:** The single entitlement vocabulary and the community (free) provider. This is the gate every paywall will route through.

**Done when:** `createCommunityProvider()` reports every paid `Feature` as `false`, returns the community caps from `limit()`, and `expiresAt` is `null`. Tests green.

**Guardrails:** `CommunityProvider` must be pure/synchronous (no I/O). It must NOT enable any paid feature. Limit values come from `COMMUNITY_LIMITS` (Global Constraints) — do not invent others.

**Files:**
- Create: `packages/sdk/src/entitlements.ts`, `packages/sdk/src/entitlements.test.ts`
- Modify: `packages/sdk/src/index.ts`

**Interfaces:**
- Produces:
  - `type Feature = 'ai.copilot' | 'integrations' | 'notifications.delivery' | 'analytics'`
  - `type LimitKey = 'projects' | 'members' | 'seats'`
  - `interface Entitlements { features: ReadonlySet<Feature>; limits: Readonly<Record<LimitKey, number>>; expiresAt: number | null }`
  - `interface EntitlementProvider { get(): Entitlements; can(f: Feature): boolean; limit(k: LimitKey): number }`
  - `const COMMUNITY_LIMITS: Record<LimitKey, number>`
  - `function createCommunityProvider(): EntitlementProvider`

- [ ] **Step 1: Write the failing test**

```ts
// packages/sdk/src/entitlements.test.ts
import { describe, it, expect } from 'vitest';
import { createCommunityProvider, COMMUNITY_LIMITS } from './entitlements';

describe('CommunityProvider', () => {
  const p = createCommunityProvider();

  it('disables every paid feature', () => {
    for (const f of ['ai.copilot', 'integrations', 'notifications.delivery', 'analytics'] as const) {
      expect(p.can(f)).toBe(false);
    }
  });

  it('reports community caps', () => {
    expect(p.limit('projects')).toBe(COMMUNITY_LIMITS.projects);
    expect(p.limit('members')).toBe(COMMUNITY_LIMITS.members);
  });

  it('never expires', () => {
    expect(p.get().expiresAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/sdk test`
Expected: FAIL — `./entitlements` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// packages/sdk/src/entitlements.ts
export type Feature = 'ai.copilot' | 'integrations' | 'notifications.delivery' | 'analytics';
export type LimitKey = 'projects' | 'members' | 'seats';

export interface Entitlements {
  features: ReadonlySet<Feature>;
  limits: Readonly<Record<LimitKey, number>>; // -1 = unlimited
  expiresAt: number | null; // epoch ms, null = never expires
}

export interface EntitlementProvider {
  get(): Entitlements;
  can(feature: Feature): boolean;
  limit(key: LimitKey): number;
}

// Free-tier caps. Tunable product values; -1 = unlimited.
export const COMMUNITY_LIMITS: Record<LimitKey, number> = {
  projects: 3,
  members: 10,
  seats: 10,
};

export function createEntitlementProvider(snapshot: Entitlements): EntitlementProvider {
  return {
    get: () => snapshot,
    can: (feature) => snapshot.features.has(feature),
    limit: (key) => snapshot.limits[key],
  };
}

export function createCommunityProvider(): EntitlementProvider {
  return createEntitlementProvider({
    features: new Set<Feature>(), // no paid features
    limits: { ...COMMUNITY_LIMITS },
    expiresAt: null,
  });
}
```

Add to `packages/sdk/src/index.ts`:

```ts
export * from './entitlements';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @productmap/sdk test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src
git commit -m "feat(sdk): entitlement contracts + CommunityProvider"
```

---

## Task 3: Server plugin registry

**Goal:** A registry the core calls at boot to let paid plugins mount Hono routes under `/api/ee/<name>`. Core adds zero plugins.

**Done when:** A registry can `add()` plugins (deduped by name), `list()` them, and `registerAll(app, ctx)` invokes each plugin's `register`. Tests green with a fake plugin.

**Guardrails:** The registry must not import anything runtime-heavy — `Hono` is a **type-only** import. Adding two plugins with the same name must throw (catches accidental double-registration). The registry must not auto-mount anything itself; mounting is the plugin's job via `register`.

**Files:**
- Create: `packages/sdk/src/server-plugins.ts`, `packages/sdk/src/server-plugins.test.ts`
- Modify: `packages/sdk/src/index.ts`

**Interfaces:**
- Consumes: `EntitlementProvider` (Task 2).
- Produces:
  - `interface PluginContext { entitlements: EntitlementProvider }`
  - `interface ServerPlugin { name: string; register(app: Hono, ctx: PluginContext): void }`
  - `function createServerPluginRegistry(): { add(p: ServerPlugin): void; list(): readonly ServerPlugin[]; registerAll(app: Hono, ctx: PluginContext): void }`

- [ ] **Step 1: Write the failing test**

```ts
// packages/sdk/src/server-plugins.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createServerPluginRegistry, type ServerPlugin } from './server-plugins';
import { createCommunityProvider } from './entitlements';

const ctx = { entitlements: createCommunityProvider() };
const fakeApp = {} as never;

function fakePlugin(name: string): ServerPlugin {
  return { name, register: vi.fn() };
}

describe('server plugin registry', () => {
  it('registers all added plugins exactly once', () => {
    const reg = createServerPluginRegistry();
    const a = fakePlugin('a');
    const b = fakePlugin('b');
    reg.add(a);
    reg.add(b);
    reg.registerAll(fakeApp, ctx);
    expect(a.register).toHaveBeenCalledWith(fakeApp, ctx);
    expect(b.register).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate plugin names', () => {
    const reg = createServerPluginRegistry();
    reg.add(fakePlugin('dup'));
    expect(() => reg.add(fakePlugin('dup'))).toThrow(/dup/);
  });

  it('starts empty', () => {
    expect(createServerPluginRegistry().list()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/sdk test`
Expected: FAIL — `./server-plugins` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// packages/sdk/src/server-plugins.ts
import type { Hono } from 'hono';
import type { EntitlementProvider } from './entitlements';

export interface PluginContext {
  entitlements: EntitlementProvider;
}

export interface ServerPlugin {
  /** Mounts routes under /api/ee/<name>. Must be unique across the install. */
  name: string;
  register(app: Hono, ctx: PluginContext): void;
}

export interface ServerPluginRegistry {
  add(plugin: ServerPlugin): void;
  list(): readonly ServerPlugin[];
  registerAll(app: Hono, ctx: PluginContext): void;
}

export function createServerPluginRegistry(): ServerPluginRegistry {
  const plugins = new Map<string, ServerPlugin>();
  return {
    add(plugin) {
      if (plugins.has(plugin.name)) {
        throw new Error(`Duplicate server plugin: ${plugin.name}`);
      }
      plugins.set(plugin.name, plugin);
    },
    list: () => [...plugins.values()],
    registerAll(app, ctx) {
      for (const plugin of plugins.values()) plugin.register(app, ctx);
    },
  };
}
```

Add to `packages/sdk/src/index.ts`:

```ts
export * from './server-plugins';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @productmap/sdk test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src
git commit -m "feat(sdk): server plugin registry seam"
```

---

## Task 4: JobQueue interface + in-process default impl

**Goal:** A background-jobs seam (interface in sdk) plus a simple in-process implementation in the api so the core owns one job pattern instead of the paid repo inventing its own.

**Done when:** sdk exports the `JobQueue` types; `createInProcessJobQueue()` runs a registered worker when its job is enqueued, and `schedule()` defers it. Tests green.

**Guardrails:** The sdk file is **types only** — no implementation, no Node imports. The in-process impl is the *default*, deliberately minimal (no durability); do not pull in a real queue library (YAGNI). Enqueue of an unregistered job name must throw, not silently drop.

**Files:**
- Create: `packages/sdk/src/jobs.ts`, `apps/api/src/lib/jobs.ts`, `apps/api/src/lib/jobs.test.ts`
- Modify: `packages/sdk/src/index.ts`

**Interfaces:**
- Produces (sdk):
  - `interface JobHandler<T = unknown> { (payload: T): Promise<void> }`
  - `interface JobQueue { registerWorker<T>(name: string, handler: JobHandler<T>): void; enqueue<T>(name: string, payload: T): Promise<void>; schedule<T>(name: string, payload: T, delayMs: number): Promise<void> }`
- Produces (api): `function createInProcessJobQueue(): JobQueue`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/jobs.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createInProcessJobQueue } from './jobs';

describe('in-process job queue', () => {
  it('runs a registered worker on enqueue', async () => {
    const q = createInProcessJobQueue();
    const seen: string[] = [];
    q.registerWorker<{ id: string }>('greet', async (p) => { seen.push(p.id); });
    await q.enqueue('greet', { id: 'x1' });
    expect(seen).toEqual(['x1']);
  });

  it('throws when enqueuing an unregistered job', async () => {
    const q = createInProcessJobQueue();
    await expect(q.enqueue('missing', {})).rejects.toThrow(/missing/);
  });

  it('defers scheduled jobs', async () => {
    vi.useFakeTimers();
    const q = createInProcessJobQueue();
    const fn = vi.fn(async () => {});
    q.registerWorker('later', fn);
    await q.schedule('later', {}, 1000);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/api test src/lib/jobs.test.ts`
Expected: FAIL — `./jobs` does not exist.

- [ ] **Step 3: Write the implementations**

```ts
// packages/sdk/src/jobs.ts
export interface JobHandler<T = unknown> {
  (payload: T): Promise<void>;
}

export interface JobQueue {
  registerWorker<T>(name: string, handler: JobHandler<T>): void;
  enqueue<T>(name: string, payload: T): Promise<void>;
  schedule<T>(name: string, payload: T, delayMs: number): Promise<void>;
}
```

```ts
// apps/api/src/lib/jobs.ts
import type { JobQueue, JobHandler } from '@productmap/sdk';

// Default in-process queue. Minimal by design: runs jobs in the current
// process, no durability. The paid edition can register a durable impl later.
export function createInProcessJobQueue(): JobQueue {
  const workers = new Map<string, JobHandler<never>>();

  function handlerFor(name: string): JobHandler<never> {
    const h = workers.get(name);
    if (!h) throw new Error(`No worker registered for job: ${name}`);
    return h;
  }

  return {
    registerWorker(name, handler) {
      workers.set(name, handler as JobHandler<never>);
    },
    async enqueue(name, payload) {
      await handlerFor(name)(payload as never);
    },
    async schedule(name, payload, delayMs) {
      const handler = handlerFor(name); // validate now, before deferring
      setTimeout(() => { void handler(payload as never); }, delayMs);
    },
  };
}
```

Add to `packages/sdk/src/index.ts`:

```ts
export * from './jobs';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @productmap/api test src/lib/jobs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src apps/api/src/lib/jobs.ts apps/api/src/lib/jobs.test.ts
git commit -m "feat: JobQueue seam + in-process default impl"
```

---

## Task 5: Client slot registry (framework-agnostic)

**Goal:** A registry the web app reads to discover which paid component fills a named slot. Framework-agnostic so it lives in sdk; the React component comes in Task 8.

**Done when:** `slotRegistry.register()` stores a loader by `SlotId`, `get()` returns it, `has()` reports presence, and an empty registry returns `undefined`. Tests green.

**Guardrails:** No React import in sdk. The loader is typed `() => Promise<unknown>` so sdk stays UI-framework-neutral; the web layer narrows it. Registering the same slot id twice replaces (last-wins) — a single edition fills each slot once; do not throw here (unlike server plugins, slot re-registration during HMR is normal).

**Files:**
- Create: `packages/sdk/src/slots.ts`, `packages/sdk/src/slots.test.ts`
- Modify: `packages/sdk/src/index.ts`

**Interfaces:**
- Produces:
  - `type SlotId = 'copilot.panel' | 'settings.integrations' | 'nav.analytics'`
  - `interface SlotRegistration { id: SlotId; loader: () => Promise<unknown> }`
  - `function createSlotRegistry(): { register(r: SlotRegistration): void; get(id: SlotId): SlotRegistration | undefined; has(id: SlotId): boolean }`
  - `const slotRegistry` — shared singleton from `createSlotRegistry()`

- [ ] **Step 1: Write the failing test**

```ts
// packages/sdk/src/slots.test.ts
import { describe, it, expect } from 'vitest';
import { createSlotRegistry } from './slots';

describe('slot registry', () => {
  it('returns undefined for an unfilled slot', () => {
    expect(createSlotRegistry().get('nav.analytics')).toBeUndefined();
  });

  it('stores and retrieves a registration', () => {
    const reg = createSlotRegistry();
    const loader = async () => ({ default: 'x' });
    reg.register({ id: 'nav.analytics', loader });
    expect(reg.has('nav.analytics')).toBe(true);
    expect(reg.get('nav.analytics')?.loader).toBe(loader);
  });

  it('last registration wins for the same id', () => {
    const reg = createSlotRegistry();
    const l1 = async () => ({}); const l2 = async () => ({});
    reg.register({ id: 'copilot.panel', loader: l1 });
    reg.register({ id: 'copilot.panel', loader: l2 });
    expect(reg.get('copilot.panel')?.loader).toBe(l2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/sdk test`
Expected: FAIL — `./slots` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// packages/sdk/src/slots.ts
export type SlotId = 'copilot.panel' | 'settings.integrations' | 'nav.analytics';

export interface SlotRegistration {
  id: SlotId;
  /** Lazily imports the module whose default export fills the slot. */
  loader: () => Promise<unknown>;
}

export interface SlotRegistry {
  register(reg: SlotRegistration): void;
  get(id: SlotId): SlotRegistration | undefined;
  has(id: SlotId): boolean;
}

export function createSlotRegistry(): SlotRegistry {
  const slots = new Map<SlotId, SlotRegistration>();
  return {
    register: (reg) => { slots.set(reg.id, reg); },
    get: (id) => slots.get(id),
    has: (id) => slots.has(id),
  };
}

/** Shared singleton — the edition registers into this at module-load. */
export const slotRegistry: SlotRegistry = createSlotRegistry();
```

Add to `packages/sdk/src/index.ts`:

```ts
export * from './slots';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @productmap/sdk test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src
git commit -m "feat(sdk): client slot registry seam"
```

---

## Task 6: Server entitlement middleware (`requireFeature`)

**Goal:** The server-side gate. A module holds the active `EntitlementProvider`; `requireFeature(f)` returns Hono middleware that 402s when the feature is not entitled.

**Done when:** With the community provider installed, a route guarded by `requireFeature('analytics')` returns 402 `{ error: 'feature_not_entitled', feature: 'analytics' }`; with a provider that grants it, the route runs. Tests green (no DB needed — pure Hono).

**Guardrails:** This is the real gate (Global Constraints). `requireFeature` must read the provider at request time (not capture it at import) so the boot order in Task 7 works. Default state before `setEntitlementProvider` is called must deny (fail-safe), never allow.

**Files:**
- Create: `apps/api/src/middleware/entitlements.ts`, `apps/api/src/middleware/entitlements.test.ts`

**Interfaces:**
- Consumes: `EntitlementProvider`, `Feature` (Task 2).
- Produces:
  - `function setEntitlementProvider(p: EntitlementProvider): void`
  - `function getEntitlements(): EntitlementProvider`
  - `function requireFeature(feature: Feature): MiddlewareHandler`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/middleware/entitlements.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createCommunityProvider, createEntitlementProvider } from '@productmap/sdk';
import { setEntitlementProvider, requireFeature } from './entitlements';

function appWithGate() {
  return new Hono().get('/x', requireFeature('analytics'), (c) => c.json({ ok: true }));
}

describe('requireFeature', () => {
  it('402s when the feature is not entitled (community)', async () => {
    setEntitlementProvider(createCommunityProvider());
    const res = await appWithGate().request('/x');
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: 'feature_not_entitled', feature: 'analytics' });
  });

  it('allows when the feature is entitled', async () => {
    setEntitlementProvider(createEntitlementProvider({
      features: new Set(['analytics']),
      limits: { projects: -1, members: -1, seats: -1 },
      expiresAt: null,
    }));
    const res = await appWithGate().request('/x');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/api test src/middleware/entitlements.test.ts` (sandbox not required — no DB)
Expected: FAIL — `./entitlements` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/middleware/entitlements.ts
import type { MiddlewareHandler } from 'hono';
import type { EntitlementProvider, Feature } from '@productmap/sdk';
import { createCommunityProvider } from '@productmap/sdk';

// Fail-safe default: deny paid features until a provider is explicitly set.
let provider: EntitlementProvider = createCommunityProvider();

export function setEntitlementProvider(p: EntitlementProvider): void {
  provider = p;
}

export function getEntitlements(): EntitlementProvider {
  return provider;
}

export function requireFeature(feature: Feature): MiddlewareHandler {
  return async (c, next) => {
    if (!provider.can(feature)) {
      return c.json({ error: 'feature_not_entitled', feature }, 402);
    }
    return next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @productmap/api test src/middleware/entitlements.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/entitlements.ts apps/api/src/middleware/entitlements.test.ts
git commit -m "feat(api): server entitlement gate (requireFeature)"
```

---

## Task 7: Wire plugin registry into the api boot (the zero-plugins guarantee)

**Goal:** The core wires the registry + community provider at boot and mounts any registered plugins under `/api/ee/<name>`. With zero plugins (the core default) `/api/ee/*` 404s and every existing route still works.

**Done when:** (a) a new integration test proves `/api/ee/anything` → 404 and `/api/healthz` → 200 with zero plugins; (b) adding a fake plugin then calling `installServerPlugins` mounts `/api/ee/fake/ping` → 200; (c) the **full api suite passes** (`pnpm --filter @productmap/api test`).

**Guardrails:** Do NOT call `installServerPlugins` from `app.ts` — the app module must stay plugin-free so tests of the zero-plugins state are honest and the private edition controls install order. `app.ts`'s existing `notFound`/`onError` stay last. Touch `app.ts` minimally. Boot wiring goes in `index.ts` only. The `/api/*` auth middleware already covers `/api/ee/*` — confirm a paid route is auth-gated by default (it is, via the existing global gate).

**Files:**
- Create: `apps/api/src/plugins.ts`, `apps/api/src/plugins.test.ts`
- Modify: `apps/api/src/index.ts` (boot wiring), `apps/api/src/app.ts` (comment reserving `/api/ee/*` only — no code mount)

**Interfaces:**
- Consumes: `createServerPluginRegistry`, `ServerPlugin`, `PluginContext` (Task 3); `getEntitlements`, `setEntitlementProvider` (Task 6); `createCommunityProvider` (Task 2).
- Produces:
  - `const serverPlugins: ServerPluginRegistry` (shared singleton)
  - `function installServerPlugins(app: Hono): void` — mounts `serverPlugins` using `{ entitlements: getEntitlements() }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/plugins.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, closeTestDb } from './test/helpers';
import { Hono } from 'hono';
import type { ServerPlugin } from '@productmap/sdk';
import { serverPlugins, installServerPlugins } from './plugins';
import { app } from './app';

beforeAll(async () => { await setupTestDb(); });
afterAll(async () => { await closeTestDb(); });

describe('plugin seam', () => {
  it('core boots with zero plugins: /api/ee/* is 404, core routes work', async () => {
    expect(serverPlugins.list()).toHaveLength(0);
    expect((await app.request('/api/ee/anything')).status).toBe(404);
    expect((await app.request('/api/healthz')).status).toBe(200);
  });

  it('a registered plugin mounts under /api/ee/<name>', async () => {
    const fake: ServerPlugin = {
      name: 'fake',
      register: (a) => { a.get('/api/ee/fake/ping', (c) => c.json({ pong: true })); },
    };
    const probe = new Hono();
    serverPlugins.add(fake);
    serverPlugins.registerAll(probe, { entitlements: (await import('@productmap/sdk')).createCommunityProvider() });
    expect((await probe.request('/api/ee/fake/ping')).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/api test src/plugins.test.ts` (DB-backed → run with sandbox disabled per Global Constraints)
Expected: FAIL — `./plugins` does not exist.

- [ ] **Step 3: Write the registry singleton + boot wiring**

```ts
// apps/api/src/plugins.ts
import type { Hono } from 'hono';
import { createServerPluginRegistry } from '@productmap/sdk';
import { getEntitlements } from './middleware/entitlements';

// Core registers ZERO plugins. The private edition imports this singleton and
// calls `serverPlugins.add(...)` before `installServerPlugins(app)` at its boot.
export const serverPlugins = createServerPluginRegistry();

export function installServerPlugins(app: Hono): void {
  serverPlugins.registerAll(app, { entitlements: getEntitlements() });
}
```

In `apps/api/src/index.ts`, add the boot wiring after `configureDb(nodeDb);`:

```ts
import { setEntitlementProvider } from './middleware/entitlements';
import { createCommunityProvider } from '@productmap/sdk';
import { installServerPlugins } from './plugins';

// Edition seam: core installs the community provider + zero plugins. A paid
// edition replaces the provider and adds plugins before this runs.
setEntitlementProvider(createCommunityProvider());
installServerPlugins(app);
```

In `apps/api/src/app.ts`, add a comment above `app.notFound(...)` (no code change to routing):

```ts
// Reserved: /api/ee/* is the mount namespace for edition plugins (see plugins.ts).
// Core registers none, so unmatched /api/ee/* falls through to notFound (404).
```

- [ ] **Step 4: Run the new test, then the full api suite**

Run: `pnpm --filter @productmap/api test src/plugins.test.ts`
Expected: PASS (2 tests).

Run: `pnpm --filter @productmap/api test`
Expected: PASS — entire api suite green (proves zero-plugins wiring broke nothing).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plugins.ts apps/api/src/plugins.test.ts apps/api/src/index.ts apps/api/src/app.ts
git commit -m "feat(api): wire plugin registry at boot; reserve /api/ee/*"
```

---

## Task 8: Web `<Slot>` component + entitlements context

**Goal:** The client seam: a `<Slot id>` that lazy-renders whatever the slot registry holds (nothing if empty), and an entitlements context so paid UI can self-hide. Both default to community/empty.

**Done when:** `<Slot id="nav.analytics" />` renders nothing when the registry is empty and renders the registered component (code-split via `lazy`) when one is added; `useEntitlement('analytics')` is `false` under the default community provider. Tests green (jsdom + Testing Library).

**Guardrails:** Slot rendering is build-time composition — `lazy(loader)`, no network/runtime plugin fetch. Client checks are UX-only (Global Constraints); add a code comment saying so. Do not register any real slot fill here (that's paid code) — tests use a local fake.

**Files:**
- Create: `apps/web/src/lib/slots.tsx`, `apps/web/src/lib/slots.test.tsx`, `apps/web/src/lib/entitlements.tsx`, `apps/web/src/lib/entitlements.test.tsx`

**Interfaces:**
- Consumes: `slotRegistry`, `SlotId`, `createCommunityProvider`, `Feature` (sdk).
- Produces:
  - `function Slot(props: { id: SlotId }): JSX.Element | null`
  - `function EntitlementsProvider(props: { children: React.ReactNode; provider?: EntitlementProvider }): JSX.Element`
  - `function useEntitlement(feature: Feature): boolean`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/lib/slots.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { slotRegistry } from '@productmap/sdk';
import { Slot } from './slots';

describe('<Slot>', () => {
  it('renders nothing for an unfilled slot', () => {
    const { container } = render(<Slot id="copilot.panel" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the registered component', async () => {
    slotRegistry.register({
      id: 'nav.analytics',
      loader: async () => ({ default: () => <span>ANALYTICS</span> }),
    });
    render(<Slot id="nav.analytics" />);
    await waitFor(() => expect(screen.getByText('ANALYTICS')).toBeInTheDocument());
  });
});
```

```tsx
// apps/web/src/lib/entitlements.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { EntitlementsProvider, useEntitlement } from './entitlements';

describe('useEntitlement', () => {
  it('is false for paid features under the default community provider', () => {
    const { result } = renderHook(() => useEntitlement('analytics'), {
      wrapper: ({ children }) => <EntitlementsProvider>{children}</EntitlementsProvider>,
    });
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @productmap/web test src/lib/slots.test.tsx src/lib/entitlements.test.tsx`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Write the implementations**

```tsx
// apps/web/src/lib/slots.tsx
import { lazy, Suspense, type ComponentType } from 'react';
import { slotRegistry, type SlotId } from '@productmap/sdk';

// Build-time composition: the edition registers a loader into slotRegistry at
// module-load; we lazy-import it. No runtime/network plugin loading.
export function Slot({ id }: { id: SlotId }) {
  const reg = slotRegistry.get(id);
  if (!reg) return null; // empty slot → nothing (community default)
  const Component = lazy(reg.loader as () => Promise<{ default: ComponentType }>);
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
}
```

```tsx
// apps/web/src/lib/entitlements.tsx
import { createContext, useContext, type ReactNode } from 'react';
import {
  createCommunityProvider,
  type EntitlementProvider,
  type Feature,
} from '@productmap/sdk';

// UX-only: hides/labels paid affordances. NEVER the real gate — the server's
// requireFeature is the enforcement boundary.
const EntitlementsContext = createContext<EntitlementProvider>(createCommunityProvider());

export function EntitlementsProvider({
  children,
  provider,
}: {
  children: ReactNode;
  provider?: EntitlementProvider;
}) {
  return (
    <EntitlementsContext.Provider value={provider ?? createCommunityProvider()}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlement(feature: Feature): boolean {
  return useContext(EntitlementsContext).can(feature);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @productmap/web test src/lib/slots.test.tsx src/lib/entitlements.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/slots.tsx apps/web/src/lib/slots.test.tsx apps/web/src/lib/entitlements.tsx apps/web/src/lib/entitlements.test.tsx
git commit -m "feat(web): <Slot> component + entitlements context seams"
```

---

## Task 9: Mount one real slot point in AppShell

**Goal:** Prove the slot seam against a real mount point in the app chrome without shipping any paid UI. The `nav.analytics` slot renders nothing in the Community build.

**Done when:** `AppShell` renders `<Slot id="nav.analytics" />`; the existing AppShell tests still pass and the shell renders identically (slot empty → no DOM change). The full web suite passes.

**Guardrails:** DEMO PATH UNTOUCHED — `AppShell` is shared, so verify the demo still mounts (run the web suite; do not alter demo files). Place the slot at a sensible nav location but keep the change tiny. Do not wrap it in anything that changes layout when empty (`<Slot>` returns `null`).

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx` (add import + one `<Slot id="nav.analytics" />`)
- Create/Modify test: `apps/web/src/components/AppShell.slot.test.tsx`

**Interfaces:**
- Consumes: `Slot` (Task 8).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/AppShell.slot.test.tsx
import { describe, it, expect } from 'vitest';
import { slotRegistry } from '@productmap/sdk';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppShell from './AppShell';

// NOTE: if AppShell needs providers/router to render, wrap accordingly here —
// mirror the wrappers used by the existing AppShell test in this directory.
function renderShell() {
  return render(<MemoryRouter><AppShell /></MemoryRouter>);
}

describe('AppShell nav.analytics slot', () => {
  it('renders the nav.analytics slot fill when registered', async () => {
    slotRegistry.register({
      id: 'nav.analytics',
      loader: async () => ({ default: () => <a>Analytics</a> }),
    });
    renderShell();
    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument());
  });
});
```

> Before writing this test, open the existing AppShell test in `apps/web/src/components/` (or `routes/`) and copy its exact provider/router wrappers — AppShell reads project/auth context. Adjust `renderShell()` to match. Do not invent wrappers.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/web test src/components/AppShell.slot.test.tsx`
Expected: FAIL — no `Analytics` element (slot not yet mounted).

- [ ] **Step 3: Add the slot to AppShell**

In `apps/web/src/components/AppShell.tsx`: add `import { Slot } from '@/lib/slots';` and place `<Slot id="nav.analytics" />` in the primary nav region (next to the existing nav links).

- [ ] **Step 4: Run the test, then the full web suite**

Run: `pnpm --filter @productmap/web test src/components/AppShell.slot.test.tsx`
Expected: PASS.

Run: `pnpm --filter @productmap/web test`
Expected: PASS — full web suite green (slot empty by default → no regressions; demo unaffected).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/AppShell.tsx apps/web/src/components/AppShell.slot.test.tsx
git commit -m "feat(web): mount nav.analytics slot in AppShell"
```

---

## Task 10: Migration namespacing helper (`migrateStream`)

**Goal:** A reusable Drizzle migration runner that applies a folder of migrations tracked in a caller-named table, so the paid edition's `ee` migrations run on their own ledger without colliding with core's.

**Done when:** `migrateStream(db, { folder, table })` applies migrations recorded in `table`; a test proves two independent streams (core default table + a custom `ee_migrations` table) coexist without one re-running or dropping the other. Tests green (DB-backed → sandbox disabled).

**Guardrails:** `ee` migrations are additive-only (Global Constraints) — the helper itself must not pass any destructive option and the test's `ee` migration must only `CREATE` objects, never touch core tables. Do NOT change `packages/db/src/migrate.ts`'s core behavior (no `migrationsTable` override there) — changing the core ledger would break existing deployments. `migrateStream` is a new, separate export.

**Files:**
- Create: `packages/db/src/migrate-stream.ts`, `packages/db/src/migrate-stream.test.ts`, and a tiny test fixture migration folder `packages/db/src/__fixtures__/ee-migrations/0000_ee_probe.sql` + its drizzle journal (`meta/_journal.json`) — see step 3.

**Interfaces:**
- Produces: `function migrateStream(db: NodePgDatabase, opts: { folder: string; table: string }): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// packages/db/src/migrate-stream.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createDb } from './index';
import { migrateStream } from './migrate-stream';

const url = process.env.DATABASE_URL ?? 'postgres://localhost:5432/productmap_test';
const here = path.dirname(fileURLToPath(import.meta.url));
const eeFolder = path.join(here, '__fixtures__', 'ee-migrations');

const { db, pool } = createDb(url);
afterAll(async () => { await pool.end(); });

describe('migrateStream', () => {
  it('applies an ee stream into its own ledger table', async () => {
    await migrateStream(db, { folder: eeFolder, table: 'ee_migrations' });
    const admin = new pg.Pool({ connectionString: url });
    // the ee migration created its own table
    const probe = await admin.query("SELECT to_regclass('public.ee_probe') AS t");
    expect(probe.rows[0].t).toBe('ee_probe');
    // the ee ledger exists and is separate from core's __drizzle_migrations
    const ledger = await admin.query("SELECT to_regclass('public.ee_migrations') AS t");
    expect(ledger.rows[0].t).toBe('ee_migrations');
    await admin.end();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @productmap/db exec vitest run src/migrate-stream.test.ts` (DB-backed → sandbox disabled)
Expected: FAIL — `./migrate-stream` does not exist.

- [ ] **Step 3: Write the helper + fixture**

```ts
// packages/db/src/migrate-stream.ts
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Runs a migration stream tracked in its own ledger table. Used by the paid
// edition for `ee` migrations so they never share core's ledger. ee migrations
// MUST be additive-only and must never alter or drop core tables.
export async function migrateStream(
  db: NodePgDatabase,
  opts: { folder: string; table: string },
): Promise<void> {
  await migrate(db, { migrationsFolder: opts.folder, migrationsTable: opts.table });
}
```

Create the fixture migration `packages/db/src/__fixtures__/ee-migrations/0000_ee_probe.sql`:

```sql
CREATE TABLE IF NOT EXISTS "ee_probe" ("id" serial PRIMARY KEY);
```

Create the drizzle journal `packages/db/src/__fixtures__/ee-migrations/meta/_journal.json` (mirror the shape used in `packages/db/migrations/meta/_journal.json`; copy that file and reduce to one entry):

```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    { "idx": 0, "version": "7", "when": 0, "tag": "0000_ee_probe", "breakpoints": true }
  ]
}
```

> If the drizzle migrator requires a `0000_ee_probe.snapshot`/meta snapshot for this version, inspect `packages/db/migrations/meta/` and replicate the minimal files the runner reads. The goal is one applied migration; keep the fixture as small as the runner allows.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @productmap/db exec vitest run src/migrate-stream.test.ts`
Expected: PASS — `ee_probe` + `ee_migrations` exist; core ledger untouched.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrate-stream.ts packages/db/src/migrate-stream.test.ts packages/db/src/__fixtures__
git commit -m "feat(db): migrateStream helper for namespaced ee migrations"
```

---

## Task 11: Foundation green-gate + seam docs

**Goal:** Prove the whole foundation holds together and document the seam contract so the private repo (and contributors) know the rules.

**Done when:** root `pnpm -r build` and `pnpm -r test` (with sandbox disabled for DB suites) both pass, and `packages/sdk/README.md` documents the five seams + the "core boots with zero plugins" + additive-migration + server-gate rules.

**Guardrails:** This task adds NO behavior. If any suite fails, fix the offending task — do not weaken the zero-plugins/zero-slots invariant to make a test pass. Keep the README short and accurate; it is the seam contract.

**Files:**
- Create: `packages/sdk/README.md`

- [ ] **Step 1: Run the full build**

Run: `pnpm -r build`
Expected: PASS — all packages typecheck/build, including `@productmap/sdk`.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm -r test` (DB-backed api/db suites need Postgres + sandbox disabled)
Expected: PASS — every package green.

- [ ] **Step 3: Write the seam contract README**

```md
// packages/sdk/README.md
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
```

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/README.md
git commit -m "docs(sdk): seam contract README + foundation green-gate"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** Seam 1 (server plugins) → Tasks 3, 7. Seam 2 (jobs) → Task 4. Seam 3 (slots) → Tasks 5, 8, 9. Seam 4 (entitlements) → Tasks 2, 6, 8. Seam 5 (migration namespacing) → Task 10. "Boots with zero plugins" invariant → Task 7 + 11. CommunityProvider → Task 2. Marketing migration (F5), private repo + license key + gated stub (F4), CI/dual-repo (F3) are explicitly OUT of this plan — separate plans.
- **Placeholder scan:** none — every code/test step has concrete content. Two steps direct the implementer to mirror existing fixtures (AppShell test wrappers, drizzle journal) rather than guess; the existing files are named.
- **Type consistency:** `Feature`/`LimitKey`/`SlotId` unions, `EntitlementProvider`, `ServerPlugin`/`PluginContext`, `JobQueue`, `SlotRegistration`, `serverPlugins`/`installServerPlugins`, `setEntitlementProvider`/`getEntitlements`/`requireFeature`, `migrateStream` — all defined once and referenced consistently across tasks.

## Out of scope (separate plans)
- **F3** — CI pipelines + submodule/git-dep dual-repo wiring.
- **F4** — private `productmap-cloud` repo skeleton, `LicenseKeyProvider` + key-signing tooling, one trivial gated stub exercising all five seams end-to-end.
- **F5** — marketing migration to private + `web-ui` shared-package extraction.

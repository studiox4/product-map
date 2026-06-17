# Phase 2a — Data Migration (rename + project scoping) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `products`→`projects` and make every globally-scoped table project-scoped (add `projectId` + `memberships`, backfill existing data to the one current project), as a **purely additive, behavior-neutral** change — no route paths or authorization change in this stage.

**Architecture:** Drizzle schema edits + generated SQL migrations applied in order: (1) rename, (2) `memberships` table, (3) add nullable `projectId` to scoped tables, (4) backfill + set `NOT NULL`. Plus a `loadScoped` helper skeleton (used heavily in 2b). The app keeps working exactly as before — one implicit project.

**Tech Stack:** Drizzle ORM + Postgres, Vitest, pnpm workspaces. Migrations: `pnpm --filter @productmap/db generate` then apply.

**Reference spec:** `docs/superpowers/specs/2026-06-16-phase-2-projects-membership-design.md` (§4, §5, §11). **Stage DoD:** full suite + build green; app behavior unchanged; migration idempotent (nullable→backfill→NOT NULL); membership backfill verified (all users members, admin=owner). **No route-path changes in 2a.**

**Branch:** `phase-2a-data-migration` off `main`.

**Environment notes for the executor:**
- DB tests need Postgres on localhost:5432 → run vitest/migrate with the sandbox DISABLED (`dangerouslyDisableSandbox: true`) when you hit `connect EPERM :5432`.
- `git-filter`-style global renames: prefer the editor's Edit with `replace_all`, or `grep -rl X | xargs sed -i ''` (macOS sed needs `''`). Always re-run tsc + tests after.
- `@productmap/db has no exported member` editor diagnostics are LSP-only noise; `tsc` is the source of truth.

---

## File Structure

**Schema / migrations (`packages/db`):**
- Modify `src/schema.ts` — rename `products`→`projects`, `product_id`→`project_id`; add `memberRoleEnum` + `memberships`; add `projectId` to `ideas, releases, objectives, plans, shareTokens, documents, decisions`.
- Generate migrations under `migrations/` (rename; memberships; add-columns; backfill+notnull). The backfill is hand-written SQL.
- Modify `src/seed-data.ts`, `src/reset.ts` — `products`→`projects`, create memberships in seed.

**Shared (`packages/shared`):**
- `src/api-types.ts` — `Product`→`Project`, `productId`→`projectId`, `ShareData.product`→`project`, `OverviewResponse.product`→`project`; add `Membership`/`MemberRole` types.
- `src/schemas.ts` — `productUpdate`→`projectUpdate` (+ keep field names).

**API (`apps/api`):**
- Rename `routes/products.ts`→`routes/projects.ts` (still just the existing PATCH for now; expanded in 2b); update `app.ts` mount.
- `routes/features.ts`, `routes/ideas.ts`, `routes/overview.ts`, `routes/share.ts`, `lib/votes.ts` — `productId`→`projectId` field refs (no path changes).
- `src/lib/scope.ts` (new) — `loadScoped` helper + test.
- All `*.test.ts` referencing `products`/`productId` — update to `projects`/`projectId`.
- `src/test/helpers.ts` — `truncateAll` table list; add `createTestProject` + `addMembership` helpers.

**Web (`apps/web`):**
- `src/lib/api.ts` — `Product`→`Project`, `productId`→`projectId`, `useUpdateProduct`→`useUpdateProject` (keep behavior).
- All `*.test.tsx`/`*.test.ts` + components referencing `productId`/`Product` — rename.

---

## Task 1: Rename products→projects in schema + generate rename migration

**Files:** Modify `packages/db/src/schema.ts`; generate `packages/db/migrations/0008_*.sql`.

- [ ] **Step 1: Edit schema.ts** — rename the table and the FK column:
  - `export const products = pgTable('products', {...})` → `export const projects = pgTable('projects', {...})` (keep columns: id, name, vision, aboutMd, createdAt).
  - In `features`: `productId: uuid('product_id').notNull().references(() => products.id, ...)` → `projectId: uuid('project_id').notNull().references(() => projects.id, ...)`.
  - Update any other in-file reference to `products` (e.g. relations) to `projects`.

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @productmap/db generate`
Expected: a `0008_*.sql`. **Drizzle may ask whether `products`→`projects` is a rename or drop/create** — it must be treated as a RENAME (and `product_id`→`project_id` a column rename). If `generate` produces `DROP TABLE products` + `CREATE TABLE projects` instead of `ALTER TABLE ... RENAME`, hand-edit the generated SQL to use:
```sql
ALTER TABLE "products" RENAME TO "projects";
ALTER TABLE "features" RENAME COLUMN "product_id" TO "project_id";
```
and remove any drop/recreate. (Preserves existing rows + FK.)

- [ ] **Step 3: Apply against the test DB**

Run (sandbox off): `DATABASE_URL=postgres://localhost:5432/productmap_test pnpm --filter @productmap/db migrate`
Expected: `migrations applied`, no error.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations
git commit -m "refactor(db): rename products -> projects (table + features.project_id)"
```

---

## Task 2: Propagate the rename across shared + api + web (mechanical)

**Files:** every file from the spec's reference list. This is a behavior-neutral global rename. Apply precisely these substitutions, then make the suite green.

- [ ] **Step 1: Shared types** (`packages/shared/src/api-types.ts`, `schemas.ts`)
  - `interface Product` → `interface Project` (same fields).
  - `productId: string` → `projectId: string` (in `Feature` and anywhere).
  - `ShareData.product: Product` → `project: Project`; `OverviewResponse.product` → `project`.
  - `productUpdate` zod → `projectUpdate` (keep `{ name?, vision?, aboutMd? }`).
  - Add: `export type MemberRole = 'owner' | 'editor' | 'viewer';` and `export interface Membership { userId: string; projectId: string; role: MemberRole; }` (used in 2b; declare now).

- [ ] **Step 2: DB seed/reset** (`packages/db/src/seed-data.ts`, `reset.ts`)
  - `products`→`projects`, `productId`→`projectId` in inserts/refs. (Membership seed added in Task 3.)
  - `reset.ts` truncate list: `products`→`projects`.

- [ ] **Step 3: API** — rename `apps/api/src/routes/products.ts` → `routes/projects.ts`:
  - Inside: `products`→`projects`, `productUpdate`→`projectUpdate`, export `productsRoutes`→`projectsRoutes`.
  - `apps/api/src/app.ts`: `import { projectsRoutes } from './routes/projects'` and `.route('/api/projects', projectsRoutes)` (was `/api/products`, `productsRoutes`). **Path changes from `/api/products` to `/api/projects` — this is the one allowed path change in 2a (it's the renamed resource, not a scoping change).**
  - `routes/features.ts`, `routes/ideas.ts`, `routes/overview.ts`, `routes/share.ts`, `lib/votes.ts`: `productId`→`projectId`, `products`→`projects` table refs. In `overview.ts`/`share.ts` the response key `product`→`project`.

- [ ] **Step 4: Web** (`apps/web/src/lib/api.ts` + components/tests)
  - `Product`→`Project`, `productId`→`projectId`, `useUpdateProduct`→`useUpdateProject`, `ProductUpdateInput`→`ProjectUpdateInput`, `/api/products`→`/api/projects`, `OverviewResponse.product`→`project`, `ShareData.product`→`project`.
  - Update every web test fixture/usage of `productId`/`product`.

- [ ] **Step 5: API + web test files** — update all `*.test.ts(x)` from the reference list: `productId`→`projectId`, `products`→`projects`, `/api/products`→`/api/projects`, `product:`→`project:` in expected response shapes. Rename `routes/products.test.ts`→`routes/projects.test.ts`.

- [ ] **Step 6: Typecheck + full suite (sandbox off for DB)**

Run: `pnpm --filter @productmap/api exec tsc -p tsconfig.json --noEmit` → 0
Run: `pnpm --filter @productmap/web exec tsc -p tsconfig.json --noEmit` → 0
Run: `pnpm test` → all green (api 297-ish, web 331, shared, templates). Counts unchanged from before the rename.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: propagate products->projects rename across shared, api, web, tests"
```

---

## Task 3: Add memberships table + member_role enum

**Files:** `packages/db/src/schema.ts`; generate migration; `packages/db/src/seed-data.ts`; `apps/api/src/test/helpers.ts`.

- [ ] **Step 1: Schema** — add after `userRoleEnum`:
```ts
export const memberRoleEnum = pgEnum('member_role', ['owner', 'editor', 'viewer']);
export const memberships = pgTable(
  'memberships',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('editor'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] })],
);
```
(Ensure `primaryKey` is imported from `drizzle-orm/pg-core` — it is already used by other tables.)

- [ ] **Step 2: Generate + apply**

Run: `pnpm --filter @productmap/db generate` → `0009_*.sql` creating `member_role` enum + `memberships`.
Run (sandbox off): `DATABASE_URL=postgres://localhost:5432/productmap_test pnpm --filter @productmap/db migrate` → applied.

- [ ] **Step 3: Seed memberships** — in `seed-data.ts`, after users + project are created, insert a membership per user for the seeded project; the admin (first user) gets `owner`, others `editor`:
```ts
await db.insert(memberships).values(
  allUsers.map((u, i) => ({ userId: u.id, projectId: project.id, role: i === 0 ? 'owner' as const : 'editor' as const })),
);
```
(Adapt variable names to the seed's actuals; `allUsers[0]` is the admin per Phase 1 seed.)

- [ ] **Step 4: Test helpers** — in `apps/api/src/test/helpers.ts` add:
```ts
import { memberships, projects } from '@productmap/db';

export async function createTestProject(name = 'Test Project') {
  const [row] = await hdb().insert(projects).values({ name }).returning();
  return row;
}
export async function addMembership(userId: string, projectId: string, role: 'owner' | 'editor' | 'viewer' = 'editor') {
  await hdb().insert(memberships).values({ userId, projectId, role });
}
```
Add `memberships` to the `truncateAll` table list (before `users`/`projects` per FK order — memberships references both; truncate it among the cascade list).

- [ ] **Step 5: Verify seed runs (sandbox off)**

Run: `pnpm db:reset && pnpm db:seed` → completes; admin login line still logged; no FK errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db apps/api/src/test/helpers.ts
git commit -m "feat(db): add memberships table + seed memberships (admin=owner)"
```

---

## Task 4: Add nullable projectId to the globally-scoped tables

**Files:** `packages/db/src/schema.ts`; generate migration.

- [ ] **Step 1: Schema** — add `projectId` to each of `ideas`, `releases`, `objectives`, `plans`, `shareTokens`, `documents`, `decisions`. Add it **nullable for now** (backfill in Task 5 sets NOT NULL). For each table add a column like:
```ts
projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
```
(Place consistently; keep existing columns. For `documents` and `decisions` this sits alongside their existing nullable `featureId`/`ideaId`.)

- [ ] **Step 2: Generate + apply (nullable add)**

Run: `pnpm --filter @productmap/db generate` → `0010_*.sql` (ADD COLUMN project_id nullable + FK on the 7 tables).
Run (sandbox off): `DATABASE_URL=postgres://localhost:5432/productmap_test pnpm --filter @productmap/db migrate` → applied.

- [ ] **Step 3: Commit**

```bash
git add packages/db
git commit -m "feat(db): add nullable project_id to ideas/releases/objectives/plans/share_tokens/documents/decisions"
```

---

## Task 5: Backfill project_id + memberships, then NOT NULL

**Files:** hand-written migration `packages/db/migrations/0011_backfill_project_scope.sql` + register in the drizzle journal (or use a `tsx` data-migration script — see Step 2). Test: `apps/api/src/lib/scope.backfill.test.ts`.

This task converts existing single-project data. Backfill must run AFTER the columns exist (Task 4) and BEFORE `NOT NULL`.

- [ ] **Step 1: Write a backfill test (fixture = one project, some rows, some users)**

```ts
// apps/api/src/routes/migration.backfill.test.ts
import { setupTestDb, truncateAll, closeTestDb, createTestUser } from '../test/helpers';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDb, projects, ideas, releases, memberships, users } from '@productmap/db';
import { sql } from 'drizzle-orm';

const db = createDb(process.env.TEST_PG_BASE ? `${process.env.TEST_PG_BASE}/productmap_test` : 'postgres://localhost:5432/productmap_test').db;
beforeAll(setupTestDb); afterAll(closeTestDb); beforeEach(truncateAll);

it('backfill assigns all orphan rows to the sole project and memberships to all users', async () => {
  const [p] = await db.insert(projects).values({ name: 'P' }).returning();
  const admin = await createTestUser({ role: 'admin' });
  const member = await createTestUser({ role: 'member' });
  await db.insert(ideas).values({ title: 'i', projectId: null as never });   // orphan
  await db.insert(releases).values({ name: 'r', projectId: null as never });  // orphan

  // run the backfill SQL (same statements as the migration)
  await db.execute(sql`UPDATE ideas SET project_id = ${p.id} WHERE project_id IS NULL`);
  await db.execute(sql`UPDATE releases SET project_id = ${p.id} WHERE project_id IS NULL`);
  await db.execute(sql`INSERT INTO memberships (user_id, project_id, role)
    SELECT u.id, ${p.id}, CASE WHEN u.role = 'admin' THEN 'owner'::member_role ELSE 'editor'::member_role END
    FROM users u ON CONFLICT DO NOTHING`);

  const [{ count: orphanIdeas }] = await db.execute(sql`SELECT count(*)::int FROM ideas WHERE project_id IS NULL`) as unknown as [{ count: number }];
  expect(orphanIdeas).toBe(0);
  const mem = await db.select().from(memberships);
  expect(mem.length).toBe(2);
  expect(mem.find((m) => m.userId === admin.id)?.role).toBe('owner');
  expect(mem.find((m) => m.userId === member.id)?.role).toBe('editor');
});
```
(Adjust the result-unwrapping to drizzle's `execute` return shape in this version if needed.)

- [ ] **Step 2: Run it (sandbox off), confirm PASS** — this validates the exact SQL the migration will use.

Run: `pnpm --filter @productmap/api exec vitest run src/routes/migration.backfill.test.ts`

- [ ] **Step 3: Author the backfill migration** — create an empty custom migration so drizzle writes the journal/snapshot entry for you, then paste the SQL:

Run: `pnpm --filter @productmap/db exec drizzle-kit generate --custom --name=backfill_project_scope`
This creates `packages/db/migrations/0011_backfill_project_scope.sql` (empty) + updates `meta/_journal.json`. Paste this into it: pick the single existing project id, set `project_id` on all 7 tables' NULL rows to it, insert memberships for all users (admin→owner else editor), then set the 7 columns `NOT NULL`. The DO block keeps it safe with zero/one projects:
```sql
DO $$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM projects ORDER BY created_at ASC LIMIT 1;
  IF pid IS NOT NULL THEN
    UPDATE ideas        SET project_id = pid WHERE project_id IS NULL;
    UPDATE releases     SET project_id = pid WHERE project_id IS NULL;
    UPDATE objectives   SET project_id = pid WHERE project_id IS NULL;
    UPDATE plans        SET project_id = pid WHERE project_id IS NULL;
    UPDATE share_tokens SET project_id = pid WHERE project_id IS NULL;
    UPDATE documents    SET project_id = pid WHERE project_id IS NULL;
    UPDATE decisions    SET project_id = pid WHERE project_id IS NULL;
    INSERT INTO memberships (user_id, project_id, role)
      SELECT u.id, pid, CASE WHEN u.role = 'admin' THEN 'owner'::member_role ELSE 'editor'::member_role END
      FROM users u
      ON CONFLICT (user_id, project_id) DO NOTHING;
  END IF;
END $$;

ALTER TABLE ideas        ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE releases     ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE objectives   ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE plans        ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE share_tokens ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE documents    ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE decisions    ALTER COLUMN project_id SET NOT NULL;
```
Register it in `packages/db/migrations/meta/_journal.json` following the existing entries' shape (tag `0011_backfill_project_scope`, next idx, a stamped `when`), OR generate an empty migration via drizzle and paste the SQL into it so the journal entry is created for you. Then add a matching `meta/0011_snapshot.json` only if drizzle requires one — prefer the "generate empty then paste" route to keep the journal/snapshot consistent.

- [ ] **Step 4: Apply on a freshly reset DB end-to-end (sandbox off)**

Run: `dropdb productmap_test 2>/dev/null; createdb productmap_test; DATABASE_URL=postgres://localhost:5432/productmap_test pnpm --filter @productmap/db migrate`
Expected: all migrations apply clean (0008→0011), including backfill + NOT NULL with no constraint violation (an empty DB has no rows; NOT NULL on empty tables is fine).

- [ ] **Step 5: Make schema NOT NULL match** — update `schema.ts` so the 7 `projectId` columns are `.notNull()` (now that the migration enforces it), so the Drizzle types are non-nullable for 2b. Re-run `pnpm --filter @productmap/db generate` — it should produce **no new migration** (schema now matches DB). If it wants to emit a NOT NULL migration, that means Step 3's ALTERs weren't captured — reconcile so generate is clean.

- [ ] **Step 6: Commit**

```bash
git add packages/db apps/api/src/routes/migration.backfill.test.ts
git commit -m "feat(db): backfill project_id + memberships, enforce NOT NULL"
```

---

## Task 6: `loadScoped` helper skeleton + tests

**Files:** Create `apps/api/src/lib/scope.ts`; Test `apps/api/src/lib/scope.test.ts`. (Used pervasively in 2b; built + tested now.)

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/scope.test.ts
import { setupTestDb, truncateAll, closeTestDb, createTestProject } from '../test/helpers';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ideas } from '@productmap/db';
import { loadScoped, ScopeError } from './scope';
import { createDb } from '@productmap/db';

const db = createDb(process.env.TEST_PG_BASE ? `${process.env.TEST_PG_BASE}/productmap_test` : 'postgres://localhost:5432/productmap_test').db;
beforeAll(setupTestDb); afterAll(closeTestDb); beforeEach(truncateAll);

it('returns the row when it belongs to the project', async () => {
  const p = await createTestProject();
  const [idea] = await db.insert(ideas).values({ title: 'x', projectId: p.id }).returning();
  const row = await loadScoped(ideas, idea.id, p.id);
  expect(row.id).toBe(idea.id);
});

it('throws ScopeError(404) when the row belongs to another project', async () => {
  const a = await createTestProject('A');
  const b = await createTestProject('B');
  const [ideaB] = await db.insert(ideas).values({ title: 'b', projectId: b.id }).returning();
  await expect(loadScoped(ideas, ideaB.id, a.id)).rejects.toMatchObject({ status: 404 });
});

it('throws ScopeError(404) when the row does not exist', async () => {
  const a = await createTestProject('A');
  await expect(loadScoped(ideas, '00000000-0000-0000-0000-000000000000', a.id)).rejects.toMatchObject({ status: 404 });
});
```

- [ ] **Step 2: Run it, confirm FAIL** (sandbox off): `pnpm --filter @productmap/api exec vitest run src/lib/scope.test.ts`

- [ ] **Step 3: Implement `apps/api/src/lib/scope.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { db } from '../db';

/** Thrown when a resource is missing or belongs to another project. Carries 404 (don't leak existence). */
export class ScopeError extends Error {
  status = 404 as const;
  constructor(message = 'not_found') { super(message); this.name = 'ScopeError'; }
}

/**
 * Load a row by id AND assert it belongs to `projectId`. 404s otherwise.
 * Use for EVERY path id and EVERY body-supplied entity id before persisting,
 * so a member of project A can never reference project B's rows. The table
 * must have `id` and `projectId` columns.
 */
export async function loadScoped<T extends { id: any; projectId: any }>(
  table: T,
  id: string,
  projectId: string,
): Promise<T['$inferSelect']> {
  const [row] = await db.select().from(table as any).where(and(eq((table as any).id, id), eq((table as any).projectId, projectId))).limit(1);
  if (!row) throw new ScopeError();
  return row as T['$inferSelect'];
}
```
(If the generic typing fights Drizzle in this version, loosen to `table: any` with a documented contract — the runtime behavior and tests are what matter. Keep the `id`+`projectId` requirement in the doc comment.)

- [ ] **Step 4: Run it, confirm PASS** (sandbox off).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/scope.ts apps/api/src/lib/scope.test.ts
git commit -m "feat(api): loadScoped helper — same-project resource guard (404 on cross-project)"
```

---

## Final verification (stage 2a DoD)

- [ ] **Migrations apply on a clean DB** (sandbox off): `dropdb productmap_test 2>/dev/null; createdb productmap_test; DATABASE_URL=postgres://localhost:5432/productmap_test pnpm --filter @productmap/db migrate` → clean.
- [ ] **Seed works** (sandbox off): `pnpm db:reset && pnpm db:seed` → admin=owner membership present.
- [ ] **Typecheck both** → 0 errors.
- [ ] **Full suite** (sandbox off): `pnpm test` → green; api/web counts unchanged except the new scope/backfill tests added.
- [ ] **Build**: `pnpm build` → clean.
- [ ] **Behavior unchanged:** no route authorization added yet (that's 2b); `/api/products`→`/api/projects` is the only path delta. The app still serves the single implicit project.

---

## Notes for the executor

- **Drizzle rename gotcha (Task 1):** if `generate` offers create/drop instead of rename, hand-write the `ALTER ... RENAME`. Never drop `products` — it holds real data.
- **Order is load-bearing:** Task 4 (nullable add) must precede Task 5 (backfill→NOT NULL). Don't add `projectId` as NOT NULL directly — existing rows would violate it.
- **Do NOT change route paths or add authorization in 2a** beyond the products→projects resource rename. `requireMembership`, URL-nesting, and `loadScoped` *application* are Phase 2b.
- The `loadScoped` helper is built here but **wired into routes in 2b**.

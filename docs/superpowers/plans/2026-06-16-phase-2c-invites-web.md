# Phase 2c — Invites API + Web (project switcher, settings, role-aware UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is bite-sized, test-first, and ends in a commit. Use EXACT code — no placeholders.

**Goal:** Ship the remaining Phase 2 surface: a link/email **invites API** (create → preview → accept → revoke, expiry, email-binding, optional SMTP), and the **web** that makes multi-project usable — a project switcher, first-run create flow, a project settings tab (rename / members / invites / delete), an accept-invite page, and role-aware UI that mirrors the server role of the active project.

**Architecture:**
- **Invites API.** A new `invites` table (`token`, `projectId`, `role`, `email?`, `expiresAt`, `revokedAt`, `createdBy`). Create/revoke live under `/api/projects/:projectId/invites` behind `requireMembership('owner')` (owner/super-admin only). Preview/accept live **top-level** at `/api/invites/:token` (you can't gate joining on a membership you don't have yet) behind plain `requireAuth`. Accept inserts a membership with the embedded role (idempotent). Email-bound invites only accept when the authenticated user's email matches.
- **SMTP seam.** A `Mailer` interface with a **no-op default** + **transport injection**. Air-gapped/offline installs (no SMTP env) get **link-only** invites — no send is attempted. When `SMTP_*` is configured a real (nodemailer) transport sends; tests inject a fake transport. nodemailer stays optional and is never required to boot.
- **Web.** A concrete `ActiveProjectProvider` / `useActiveProject` (the active-project seam — normally 2b-2's, included here so 2c is runnable standalone; see Task 7) is the single source of `{ projectId, role, projects, setProjectId, isLoading }`, sourced from `GET /api/projects` (which returns the caller's effective `role` per project from 2b-1). The switcher is its write side; first-run is its `projects.length === 0` branch; role-aware UI reads its `role`. Persisted to localStorage.

**Tech Stack:** Hono, Drizzle + Postgres, Zod (shared), Vitest (api: DB-backed; web: jsdom + msw), React, @tanstack/react-query, react-router-dom, nanoid. Builds on 2a (`projects`, `memberships`, `member_role`, `loadScoped`, `shareTokens`), **2b-1** (project/member API + `requireMembership` + `ROLE_RANK`), and **2b-2** (URL-nested scoped routes + the web threading the active project).

**Dependency note (read first):** This plan **assumes 2b-1 and 2b-2 are merged.** It uses `requireMembership(minRole)` and `MembershipEnv` from `apps/api/src/middleware/membership.ts`, the expanded `projectsRoutes` (list/create/get/patch/delete + members) from 2b-1, and `ROLE_RANK` from `@productmap/shared`. If 2b-2's active-project web threading is NOT present, **Task 7 introduces it** (one owner, no scattered fallbacks); if 2b-2 already shipped an equivalent `useActiveProject`, skip Task 7 and reuse it (its contract must match §Task 7).

**Reference spec:** `docs/superpowers/specs/2026-06-16-phase-2-projects-membership-design.md` — §8 (invites), §10 (web), §6 (roles), §14 (testing: invite create→accept→membership, expiry, revoke, email-binding, wrong-email).

**Branch:** `phase-2c-invites-web` off `main`.

**Environment:**
- **API/DB tests need Postgres on localhost:5432** → run vitest with **sandbox DISABLED** (`dangerouslyDisableSandbox: true`) whenever you hit `connect EPERM 127.0.0.1:5432`.
- **Web tests are jsdom + msw.** Node's experimental webstorage shadows jsdom's `localStorage` (methods undefined) → install the `MemoryStorage` shim (copy from `ProfileTab.test.tsx`) in every web test that touches `localStorage` (the active-project provider persists there).
- **Ignore `@productmap/db has no exported member` LSP noise** — `tsc` is truth.
- Helpers in `apps/api/src/test/helpers.ts`: `setupTestDb`, `truncateAll`, `closeTestDb`, `createTestUser`, `createTestProject`, `addMembership`, `authCookie`. Note `truncateAll` truncates a fixed table list — **you must add `invites` to it** (Task 1).

---

## File Structure

**API / shared / db:**
- `packages/db/src/schema.ts` — add `invites` table.
- `packages/db/migrations/00NN_*.sql` — generated migration adding `invites` (via `drizzle-kit generate`).
- `packages/shared/src/constants.ts` — add `INVITE_TTL_SEC` (7 days).
- `packages/shared/src/schemas.ts` — add `inviteCreate` zod schema.
- `packages/shared/src/api-types.ts` — add `Invite` + `InvitePreview` types.
- `apps/api/src/config.ts` — add `smtp` config (env-gated).
- `apps/api/src/lib/mailer.ts` (new) — `Mailer` interface, no-op default, `createMailer(config)` factory, `inviteEmail()` body builder.
- `apps/api/src/lib/mailer.test.ts` (new) — two-path tests (unconfigured = no-op; configured = injected transport called).
- `apps/api/src/routes/projects.ts` — add invite sub-routes (`POST`/`DELETE /:projectId/invites/...`).
- `apps/api/src/routes/invites.ts` (new) — top-level `GET /:token` (preview) + `POST /:token/accept`.
- `apps/api/src/app.ts` — mount `.route('/api/invites', invitesRoutes)`.
- `apps/api/src/routes/projects.test.ts` — extend (invite create/revoke, owner-only).
- `apps/api/src/routes/invites.test.ts` (new) — accept, expiry, revoke, email-binding, wrong-email, idempotency.
- `apps/api/src/test/helpers.ts` — add `invites` to `truncateAll`; add `createTestInvite` helper.

**Web:**
- `apps/web/src/lib/api.ts` — append an invites + project-membership block (hooks: `useProjects`, `useCreateProject`, `useProjectMembers`, `useAddMember`, `useUpdateMember`, `useRemoveMember`, `useDeleteProject`, `useCreateInvite`, `useProjectInvites`, `useRevokeInvite`, `useInvitePreview`, `useAcceptInvite`).
- `apps/web/src/lib/active-project.tsx` (new) — `ActiveProjectProvider`, `useActiveProject`.
- `apps/web/src/lib/active-project.test.tsx` (new).
- `apps/web/src/components/ProjectSwitcher.tsx` (new) + `.test.tsx`.
- `apps/web/src/components/AppShell.tsx` — mount `<ProjectSwitcher/>` in the nav.
- `apps/web/src/routes/FirstRun.tsx` (new) + `.test.tsx`.
- `apps/web/src/components/settings/ProjectTab.tsx` (new) + `.test.tsx`.
- `apps/web/src/routes/AcceptInvite.tsx` (new) + `.test.tsx`.
- `apps/web/src/App.tsx` — wrap authed shell in `<ActiveProjectProvider>`; add `/invite/:token` route; add `project` settings tab; gate the shell on first-run.

---

## STAGE A — Invites API

### Task 1: `invites` table + migration + helper

**Files:** `packages/db/src/schema.ts`, `packages/db/migrations/`, `apps/api/src/test/helpers.ts`.

- [ ] **Step 1:** Add the table to `schema.ts` immediately after `shareTokens` (it reuses `memberRoleEnum`, `projects`, `users` already defined above it):
```ts
export const invites = pgTable(
  'invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    token: text('token').notNull().unique(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('editor'),
    // Email-bound when set: only this address may accept. Null = link-only.
    email: text('email'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('invites_project_id_idx').on(t.projectId)],
);
```
(Confirm `index` is already imported at the top of `schema.ts` — `shareTokens` uses it, so it is.)

- [ ] **Step 2:** Generate the migration:
```bash
pnpm --filter @productmap/db exec drizzle-kit generate
```
Confirm a new `packages/db/migrations/00NN_*.sql` appears creating `invites` + the index, and `meta/_journal.json` updated. Do NOT hand-edit; if generation adds anything unexpected, inspect and re-run.

- [ ] **Step 3:** Add `invites` to `truncateAll` in `apps/api/src/test/helpers.ts` (prepend it before `share_tokens` in the truncate list):
```ts
  await getPool().query(
    'truncate table comments, votes, activity, feature_collaborators, uploads, documents, idea_votes, ideas, evidence, decisions, feature_dependencies, invites, share_tokens, plan_entries, plans, features, releases, objectives, memberships, projects, templates, users cascade',
  );
```

- [ ] **Step 4:** Add a `createTestInvite` helper at the end of `helpers.ts` (import `invites` into the existing `@productmap/db` import line):
```ts
/** Insert an invite row directly. expiresInSec defaults to +7d; pass negative to forge an expired invite. */
export async function createTestInvite(opts: {
  projectId: string;
  createdBy: string;
  role?: 'owner' | 'editor' | 'viewer';
  email?: string | null;
  token?: string;
  expiresInSec?: number;
  revoked?: boolean;
}) {
  const expiresAt = new Date(Date.now() + (opts.expiresInSec ?? 7 * 24 * 60 * 60) * 1000);
  const [row] = await hdb()
    .insert(invites)
    .values({
      projectId: opts.projectId,
      createdBy: opts.createdBy,
      role: opts.role ?? 'editor',
      email: opts.email ?? null,
      token: opts.token ?? `tok-${Math.random().toString(36).slice(2)}`,
      expiresAt,
      revokedAt: opts.revoked ? new Date() : null,
    })
    .returning();
  return row;
}
```

- [ ] **Step 5: typecheck the db package** `pnpm --filter @productmap/db exec tsc -p tsconfig.json --noEmit` → 0.

- [ ] **Step 6: commit**
```bash
git add packages/db apps/api/src/test/helpers.ts
git commit -m "feat(db): invites table + migration; test helpers (createTestInvite, truncate)"
```

---

### Task 2: Shared invite schema + types + TTL constant

**Files:** `packages/shared/src/constants.ts`, `schemas.ts`, `api-types.ts`, `schemas.test.ts`.

- [ ] **Step 1: failing test** (append to `packages/shared/src/schemas.test.ts`):
```ts
import { inviteCreate, INVITE_TTL_SEC } from './index';

describe('invite schema', () => {
  it('accepts a role; email optional', () => {
    expect(inviteCreate.safeParse({ role: 'editor' }).success).toBe(true);
    expect(inviteCreate.safeParse({ role: 'viewer', email: 'a@b.co' }).success).toBe(true);
    expect(inviteCreate.safeParse({ role: 'boss' }).success).toBe(false);
    expect(inviteCreate.safeParse({ role: 'editor', email: 'not-an-email' }).success).toBe(false);
  });
  it('defaults role to editor when omitted', () => {
    const r = inviteCreate.parse({});
    expect(r.role).toBe('editor');
  });
  it('INVITE_TTL_SEC is 7 days', () => {
    expect(INVITE_TTL_SEC).toBe(7 * 24 * 60 * 60);
  });
});
```

- [ ] **Step 2: run, confirm FAIL** — `pnpm --filter @productmap/shared exec vitest run src/schemas.test.ts`

- [ ] **Step 3:** add to `constants.ts`:
```ts
/** Default invite link lifetime — 7 days (spec §8). */
export const INVITE_TTL_SEC = 7 * 24 * 60 * 60;
```

- [ ] **Step 4:** add to `schemas.ts` (reuse the `role` enum from 2b-1 if exported there; if it's module-local, redeclare inline):
```ts
export const inviteCreate = z.object({
  role: z.enum(['owner', 'editor', 'viewer']).default('editor'),
  email: z.string().email().optional(),
});
```

- [ ] **Step 5:** add to `api-types.ts` (after `Membership`):
```ts
export interface Invite {
  token: string;
  projectId: string;
  role: MemberRole;
  email: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}
/** Public-safe preview returned by GET /api/invites/:token (no token internals leaked). */
export interface InvitePreview {
  projectId: string;
  projectName: string;
  role: MemberRole;
  email: string | null;
  expired: boolean;
}
```

- [ ] **Step 6: run, confirm PASS;** typecheck shared → 0.

- [ ] **Step 7: commit**
```bash
git add packages/shared/src
git commit -m "feat(shared): inviteCreate schema, Invite/InvitePreview types, INVITE_TTL_SEC"
```

---

### Task 3: SMTP seam — `Mailer` interface + no-op default + transport injection

**Files:** `apps/api/src/config.ts`, `apps/api/src/lib/mailer.ts` (new), `apps/api/src/lib/mailer.test.ts` (new).

The mailer must be testable **without a real mail server**: a no-op default when SMTP is unconfigured, and a transport-injection seam so a fake transport can be asserted.

- [ ] **Step 1:** Add SMTP config to `config.ts` following the existing `bool()`/env pattern. Extend `AppConfig`:
```ts
export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
}
export interface AppConfig {
  isProd: boolean;
  authSecret: string;
  allowOpenSignup: boolean;
  trustProxy: boolean;
  accessTtlSec: number;
  refreshTtlSec: number;
  /** App base URL used to build absolute invite links in emails. */
  appUrl: string;
  /** null when SMTP is not configured → invites are link-only (air-gapped fallback). */
  smtp: SmtpConfig | null;
}
```
In `loadConfig()`, before the `return`:
```ts
  const smtp: SmtpConfig | null = process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        user: process.env.SMTP_USER || undefined,
        pass: process.env.SMTP_PASS || undefined,
        from: process.env.SMTP_FROM ?? 'ProductMap <no-reply@productmap.local>',
      }
    : null;
```
Add to the returned object: `appUrl: process.env.APP_URL ?? 'http://localhost:5173', smtp,`.

- [ ] **Step 2: failing test** — `apps/api/src/lib/mailer.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createMailer, type MailTransport } from './mailer';

describe('mailer', () => {
  it('unconfigured (smtp=null) → no-op; never attempts to send', async () => {
    const send = vi.fn();
    const mailer = createMailer(null, () => ({ sendMail: send }));
    const sent = await mailer.send({ to: 'a@b.co', subject: 'Hi', text: 'body' });
    expect(sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('configured → calls the injected transport with from/to/subject/text', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'x' });
    const transport: MailTransport = { sendMail: send };
    const mailer = createMailer(
      { host: 'h', port: 587, from: 'ProductMap <no-reply@x>' },
      () => transport,
    );
    const sent = await mailer.send({ to: 'a@b.co', subject: 'Invite', text: 'link' });
    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.co', subject: 'Invite', from: 'ProductMap <no-reply@x>' }),
    );
  });
});
```

- [ ] **Step 3: run, confirm FAIL** — `pnpm --filter @productmap/api exec vitest run src/lib/mailer.test.ts` (jsdom not needed; no DB → sandbox can stay on).

- [ ] **Step 4: implement `apps/api/src/lib/mailer.ts`:**
```ts
import type { SmtpConfig } from '../config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Minimal transport contract — nodemailer's Transporter satisfies this structurally. */
export interface MailTransport {
  sendMail(msg: { from: string; to: string; subject: string; text: string; html?: string }): Promise<unknown>;
}

export interface Mailer {
  /** Sends if SMTP is configured; returns true when a send was attempted, false (no-op) otherwise. */
  send(msg: MailMessage): Promise<boolean>;
  readonly enabled: boolean;
}

/** Builds a real nodemailer transport — imported lazily so nodemailer stays an OPTIONAL dependency. */
async function defaultTransportFactory(smtp: SmtpConfig): Promise<MailTransport> {
  const nodemailer = await import('nodemailer');
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  }) as unknown as MailTransport;
}

/**
 * Create a Mailer. `smtp=null` → a no-op mailer (air-gapped/offline installs:
 * invites are link-only, no send attempted). `transportFactory` is injectable
 * for tests (and so nodemailer is only imported when actually configured).
 */
export function createMailer(
  smtp: SmtpConfig | null,
  transportFactory: (smtp: SmtpConfig) => MailTransport | Promise<MailTransport> = defaultTransportFactory,
): Mailer {
  if (!smtp) {
    return { enabled: false, async send() { return false; } };
  }
  return {
    enabled: true,
    async send(msg) {
      const transport = await transportFactory(smtp);
      await transport.sendMail({ from: smtp.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
      return true;
    },
  };
}

/** Build the invite email body. Pure — unit-testable. */
export function inviteEmail(opts: { projectName: string; role: string; url: string }): { subject: string; text: string } {
  return {
    subject: `You're invited to ${opts.projectName} on ProductMap`,
    text: `You've been invited to join "${opts.projectName}" as ${opts.role}.\n\nAccept your invite:\n${opts.url}\n\nThis link expires in 7 days.`,
  };
}
```

- [ ] **Step 5: run, confirm PASS** (2 tests). Typecheck api → 0. **Do not** add nodemailer to `dependencies` yet if it isn't present — the lazy `import` only runs when SMTP is configured. Add it as an **optional** dep only if CI flags the dynamic import; otherwise leave it absent (air-gapped default needs nothing). If you add it: `pnpm --filter @productmap/api add nodemailer && pnpm --filter @productmap/api add -D @types/nodemailer`.

- [ ] **Step 6: commit**
```bash
git add apps/api/src/lib/mailer.ts apps/api/src/lib/mailer.test.ts apps/api/src/config.ts
git commit -m "feat(api): SMTP mailer seam (no-op default + transport injection, env-gated)"
```

---

### Task 4: Invite create + revoke (owner-gated, project-scoped)

**Files:** `apps/api/src/routes/projects.ts` (add invite sub-routes), `apps/api/src/routes/projects.test.ts` (extend).

These mount under the existing `projectsRoutes` chain (already at `/api/projects`), so paths are `/:projectId/invites` and `/:projectId/invites/:token`, both behind `requireMembership('owner')`.

- [ ] **Step 1: failing tests** (append to `projects.test.ts`; reuse the `auth`/`json` helpers + setup hooks already in that file from 2b-1):
```ts
import { createMailer } from '../lib/mailer';

describe('project invites (create/revoke)', () => {
  it('owner creates a link-only invite (no email) → token returned, no send', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const res = await app.request(`/api/projects/${p.id}/invites`, json('POST', { role: 'viewer' }, await auth(owner)));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.role).toBe('viewer');
    expect(body.email).toBeNull();
    expect(body.emailSent).toBe(false); // no SMTP configured in tests
  });

  it('owner lists then revokes an invite', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(owner.id, p.id, 'owner');
    const h = await auth(owner);
    const created = await (await app.request(`/api/projects/${p.id}/invites`, json('POST', { role: 'editor' }, h))).json();

    const list = await app.request(`/api/projects/${p.id}/invites`, { headers: h });
    expect((await list.json()).length).toBe(1);

    const del = await app.request(`/api/projects/${p.id}/invites/${created.token}`, { method: 'DELETE', headers: h });
    expect(del.status).toBe(204);

    // After revoke the list omits it.
    const list2 = await app.request(`/api/projects/${p.id}/invites`, { headers: h });
    expect((await list2.json()).length).toBe(0);
  });

  it('editor cannot create or revoke invites (403)', async () => {
    const u = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    await addMembership(u.id, p.id, 'editor');
    const res = await app.request(`/api/projects/${p.id}/invites`, json('POST', { role: 'viewer' }, await auth(u)));
    expect(res.status).toBe(403);
  });

  it('non-member gets 404 on invite create (no existence leak)', async () => {
    const u = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    const res = await app.request(`/api/projects/${p.id}/invites`, json('POST', { role: 'viewer' }, await auth(u)));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: run, confirm FAIL** (sandbox off).

- [ ] **Step 3: implement.** Add to the top of `projects.ts`:
```ts
import { nanoid } from 'nanoid';
import { isNull, desc } from 'drizzle-orm';
import { invites } from '@productmap/db';
import { inviteCreate, INVITE_TTL_SEC } from '@productmap/shared';
import { config } from '../config';
import { createMailer, inviteEmail } from '../lib/mailer';
```
Add a module-scope mailer (single instance; SMTP-gated by config):
```ts
const mailer = createMailer(config.smtp);
```
Add these to the `projectsRoutes` chain (after the member routes from 2b-1):
```ts
  .get('/:projectId/invites', requireMembership('owner'), async (c) => {
    const rows = await db
      .select()
      .from(invites)
      .where(and(eq(invites.projectId, c.req.param('projectId')), isNull(invites.revokedAt)))
      .orderBy(desc(invites.createdAt));
    return c.json(
      rows.map((r) => ({
        token: r.token, projectId: r.projectId, role: r.role, email: r.email,
        expiresAt: r.expiresAt, revokedAt: r.revokedAt, createdAt: r.createdAt,
      })),
    );
  })
  .post('/:projectId/invites', requireMembership('owner'), zValidator('json', inviteCreate, bad), async (c) => {
    const projectId = c.req.param('projectId');
    const user = c.get('currentUser');
    const { role, email } = c.req.valid('json');
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + INVITE_TTL_SEC * 1000);
    const [row] = await db
      .insert(invites)
      .values({ token, projectId, role, email: email ?? null, expiresAt, createdBy: user.id })
      .returning();

    let emailSent = false;
    if (email && mailer.enabled) {
      const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId));
      const url = `${config.appUrl}/invite/${token}`;
      const body = inviteEmail({ projectName: proj?.name ?? 'a project', role, url });
      emailSent = await mailer.send({ to: email, subject: body.subject, text: body.text });
    }
    return c.json(
      { token: row.token, projectId: row.projectId, role: row.role, email: row.email, expiresAt: row.expiresAt, emailSent },
      201,
    );
  })
  .delete('/:projectId/invites/:token', requireMembership('owner'), async (c) => {
    const projectId = c.req.param('projectId');
    const [row] = await db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(and(eq(invites.projectId, projectId), eq(invites.token, c.req.param('token')), isNull(invites.revokedAt)))
      .returning();
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  });
```
(`bad`, `and`, `eq`, `requireMembership`, `projects`, `db`, `zValidator` are already imported in `projects.ts` from 2b-1. Add only the new imports above.)

- [ ] **Step 4: run, confirm PASS** (sandbox off). Typecheck api → 0.

- [ ] **Step 5: commit**
```bash
git add apps/api/src/routes/projects.ts apps/api/src/routes/projects.test.ts
git commit -m "feat(api): invite create/list/revoke (owner-gated, link-only + optional SMTP send)"
```

---

### Task 5: Invite preview + accept (top-level, auth-only)

**Files:** `apps/api/src/routes/invites.ts` (new), `apps/api/src/app.ts`, `apps/api/src/routes/invites.test.ts` (new).

Preview/accept are NOT membership-gated (you're joining). Mounted at `/api/invites` behind the global `requireAuth` gate in `app.ts` (so the user is authenticated but need not be a member). The web `/invite/:token` page redirects unauthenticated users to login then back (Task 11).

- [ ] **Step 1: failing tests** — `apps/api/src/routes/invites.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { memberships } from '@productmap/db';
import { app } from '../app';
import { db } from '../db';
import {
  setupTestDb, truncateAll, closeTestDb, createTestUser, createTestProject,
  addMembership, authCookie, createTestInvite,
} from '../test/helpers';

beforeAll(setupTestDb); afterAll(closeTestDb); beforeEach(truncateAll);
const auth = async (u: { id: string; role: 'admin' | 'member' }) => ({ cookie: await authCookie(u), origin: 'http://localhost', host: 'localhost' });

async function membershipRole(userId: string, projectId: string) {
  const [m] = await db.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.projectId, projectId)));
  return m?.role ?? null;
}

describe('invites preview + accept', () => {
  it('GET /api/invites/:token previews project + role (no token internals)', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject('Acme');
    const inv = await createTestInvite({ projectId: p.id, createdBy: owner.id, role: 'editor' });
    const joiner = await createTestUser({ role: 'member' });
    const res = await app.request(`/api/invites/${inv.token}`, { headers: await auth(joiner) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ projectId: p.id, projectName: 'Acme', role: 'editor', expired: false });
  });

  it('accept → membership row with the embedded role', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    const inv = await createTestInvite({ projectId: p.id, createdBy: owner.id, role: 'viewer' });
    const joiner = await createTestUser({ role: 'member' });
    const res = await app.request(`/api/invites/${inv.token}/accept`, { method: 'POST', headers: await auth(joiner) });
    expect(res.status).toBe(200);
    expect(await membershipRole(joiner.id, p.id)).toBe('viewer');
  });

  it('accept is idempotent when already a member (keeps existing membership, 200)', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    const inv = await createTestInvite({ projectId: p.id, createdBy: owner.id, role: 'viewer' });
    const joiner = await createTestUser({ role: 'member' });
    await addMembership(joiner.id, p.id, 'editor'); // already an editor
    const res = await app.request(`/api/invites/${inv.token}/accept`, { method: 'POST', headers: await auth(joiner) });
    expect(res.status).toBe(200);
    // Does NOT downgrade an existing higher membership.
    expect(await membershipRole(joiner.id, p.id)).toBe('editor');
  });

  it('expired invite → 410; revoked invite → 404; unknown token → 404', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    const joiner = await createTestUser({ role: 'member' });
    const expired = await createTestInvite({ projectId: p.id, createdBy: owner.id, expiresInSec: -10 });
    const revoked = await createTestInvite({ projectId: p.id, createdBy: owner.id, revoked: true });

    const e = await app.request(`/api/invites/${expired.token}/accept`, { method: 'POST', headers: await auth(joiner) });
    expect(e.status).toBe(410);
    const r = await app.request(`/api/invites/${revoked.token}/accept`, { method: 'POST', headers: await auth(joiner) });
    expect(r.status).toBe(404);
    const u = await app.request(`/api/invites/does-not-exist/accept`, { method: 'POST', headers: await auth(joiner) });
    expect(u.status).toBe(404);
  });

  it('email-bound invite: matching email accepts; wrong email rejected (403)', async () => {
    const owner = await createTestUser({ role: 'member' });
    const p = await createTestProject();
    const inv = await createTestInvite({ projectId: p.id, createdBy: owner.id, role: 'editor', email: 'invited@x.co' });

    const wrong = await createTestUser({ role: 'member', email: 'other@x.co' });
    const w = await app.request(`/api/invites/${inv.token}/accept`, { method: 'POST', headers: await auth(wrong) });
    expect(w.status).toBe(403);
    expect(await membershipRole(wrong.id, p.id)).toBeNull();

    const right = await createTestUser({ role: 'member', email: 'invited@x.co' });
    const ok = await app.request(`/api/invites/${inv.token}/accept`, { method: 'POST', headers: await auth(right) });
    expect(ok.status).toBe(200);
    expect(await membershipRole(right.id, p.id)).toBe('editor');
  });
});
```

- [ ] **Step 2: run, confirm FAIL** (sandbox off).

- [ ] **Step 3: implement `apps/api/src/routes/invites.ts`:**
```ts
import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { invites, memberships, projects, users } from '@productmap/db';
import { db } from '../db';
import type { AuthEnv } from '../middleware/auth';

/** Load a non-revoked invite by token, with project name. null when unknown/revoked. */
async function loadActiveInvite(token: string) {
  const [row] = await db
    .select({
      token: invites.token, projectId: invites.projectId, role: invites.role,
      email: invites.email, expiresAt: invites.expiresAt,
      projectName: projects.name,
    })
    .from(invites)
    .innerJoin(projects, eq(projects.id, invites.projectId))
    .where(and(eq(invites.token, token), isNull(invites.revokedAt)))
    .limit(1);
  return row ?? null;
}

export const invitesRoutes = new Hono<AuthEnv>()
  // Preview — auth required (caller is logging in to decide whether to accept).
  .get('/:token', async (c) => {
    const inv = await loadActiveInvite(c.req.param('token'));
    if (!inv) return c.json({ error: 'not_found' }, 404);
    return c.json({
      projectId: inv.projectId,
      projectName: inv.projectName,
      role: inv.role,
      email: inv.email,
      expired: inv.expiresAt.getTime() < Date.now(),
    });
  })
  // Accept — authenticated user joins with the embedded role.
  .post('/:token/accept', async (c) => {
    const user = c.get('currentUser');
    const inv = await loadActiveInvite(c.req.param('token')); // revoked/unknown → null → 404
    if (!inv) return c.json({ error: 'not_found' }, 404);
    if (inv.expiresAt.getTime() < Date.now()) return c.json({ error: 'expired' }, 410);

    if (inv.email) {
      const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, user.id));
      if (!u?.email || u.email.toLowerCase() !== inv.email.toLowerCase()) {
        return c.json({ error: 'email_mismatch' }, 403);
      }
    }

    // Idempotent: insert if absent; do NOT downgrade an existing membership.
    await db
      .insert(memberships)
      .values({ userId: user.id, projectId: inv.projectId, role: inv.role })
      .onConflictDoNothing({ target: [memberships.userId, memberships.projectId] });

    return c.json({ projectId: inv.projectId, role: inv.role });
  });
```
(Verify `AuthEnv` is the exported env type from `middleware/auth.ts` and `c.get('currentUser')` matches how other routes read the user — mirror an existing route like `users.ts`.)

- [ ] **Step 4:** mount in `app.ts` — add the import and a `.route` (top-level, sits behind the global `requireAuth` gate, NOT in the public allowlist):
```ts
import { invitesRoutes } from './routes/invites';
```
```ts
  .route('/api/invites', invitesRoutes)
```
Place it near `.route('/api/projects', projectsRoutes)`.

- [ ] **Step 5: run, confirm PASS** (sandbox off). Typecheck api → 0.

- [ ] **Step 6: commit**
```bash
git add apps/api/src/routes/invites.ts apps/api/src/routes/invites.test.ts apps/api/src/app.ts
git commit -m "feat(api): invite preview + accept (idempotent join, expiry 410, email-binding 403)"
```

---

### Task 6: STAGE A verification (invites API DoD)
- [ ] `pnpm --filter @productmap/api exec tsc -p tsconfig.json --noEmit` → 0; shared + db tsc → 0.
- [ ] `pnpm --filter @productmap/api exec vitest run` (sandbox off) → all green (new invite/mailer suites included).
- [ ] Manual sanity: owner `POST /api/projects/:id/invites {role}` → 201 `{token, emailSent:false}`; `GET /api/invites/:token` (any authed user) → preview; `POST .../accept` → membership; expired → 410; revoked → 404; email-bound wrong user → 403; editor create → 403; non-member → 404.
- [ ] Commit any test fixups: `git commit -am "test(api): stage A invites green"` (only if needed).

---

## STAGE B — Web

### Task 7: Active-project provider (the seam) — `useActiveProject`

> **Ownership note:** This is normally 2b-2's deliverable; it is included here so 2c is runnable standalone and so the switcher/first-run/role-aware tasks compose against ONE source. If 2b-2 already shipped an equivalent `useActiveProject`/`ActiveProjectProvider`, **skip this task** and confirm its contract matches the bullets below, then proceed.

**Contract (load-bearing):** `useActiveProject()` returns `{ projectId: string | null, role: MemberRole | null, projects: ProjectMembership[], setProjectId(id): void, isLoading: boolean }`. Sourced from `GET /api/projects` (2b-1 returns `{ id, name, vision, aboutMd, role }` per project). Persists the chosen `projectId` to `localStorage` (`pm.activeProjectId`). Auto-selects the first project when none persisted/valid. `role` is the active project's role — **the single source for role-aware UI** (no second fetch).

**Files:** `apps/web/src/lib/api.ts` (append `useProjects` + types), `apps/web/src/lib/active-project.tsx` (new), `apps/web/src/lib/active-project.test.tsx` (new).

- [ ] **Step 1:** Append a project-membership block to `apps/web/src/lib/api.ts` (inside a clearly-commented APPEND block, like the existing ones):
```ts
// ============================================================================
// APPEND BLOCK — projects, members, invites (phase 2c). Imports hoisted by ESM.
// ============================================================================
import type { Invite, InvitePreview, MemberRole } from '@productmap/shared';

/** A project the caller belongs to, plus the caller's effective role (GET /api/projects, 2b-1). */
export interface ProjectMembership {
  id: string;
  name: string;
  vision: string;
  aboutMd: string;
  role: MemberRole;
}

export const projectsRootKey = ['projects-list'] as const;

export function useProjects() {
  return useQuery({
    queryKey: projectsRootKey,
    queryFn: () => fetchJson<ProjectMembership[]>('/api/projects'),
    staleTime: 30_000,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; vision?: string }) =>
      fetchJson<ProjectMembership>('/api/projects', { method: 'POST', body: JSON.stringify(input) }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectsRootKey }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<void>(`/api/projects/${id}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectsRootKey }),
  });
}

// -- members --
export interface ProjectMember { userId: string; role: MemberRole; name: string; color: string; }
export const projectMembersKey = (projectId: string) => ['project-members', projectId] as const;

export function useProjectMembers(projectId: string | null) {
  return useQuery({
    queryKey: projectMembersKey(projectId ?? ''),
    queryFn: () => fetchJson<ProjectMember[]>(`/api/projects/${projectId}/members`),
    enabled: !!projectId,
  });
}

export function useAddMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email?: string; userId?: string; role: MemberRole }) =>
      fetchJson(`/api/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify(input) }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectMembersKey(projectId) }),
  });
}

export function useUpdateMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MemberRole }) =>
      fetchJson(`/api/projects/${projectId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectMembersKey(projectId) }),
  });
}

export function useRemoveMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      fetchJson<void>(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectMembersKey(projectId) }),
  });
}

// -- invites --
export const projectInvitesKey = (projectId: string) => ['project-invites', projectId] as const;

export function useProjectInvites(projectId: string | null) {
  return useQuery({
    queryKey: projectInvitesKey(projectId ?? ''),
    queryFn: () => fetchJson<Invite[]>(`/api/projects/${projectId}/invites`),
    enabled: !!projectId,
  });
}

export interface CreateInviteResult { token: string; projectId: string; role: MemberRole; email: string | null; emailSent: boolean; }

export function useCreateInvite(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { role: MemberRole; email?: string }) =>
      fetchJson<CreateInviteResult>(`/api/projects/${projectId}/invites`, { method: 'POST', body: JSON.stringify(input) }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectInvitesKey(projectId) }),
  });
}

export function useRevokeInvite(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => fetchJson<void>(`/api/projects/${projectId}/invites/${token}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectInvitesKey(projectId) }),
  });
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: () => fetchJson<InvitePreview>(`/api/invites/${token}`),
    enabled: token.length > 0,
    retry: false,
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      fetchJson<{ projectId: string; role: MemberRole }>(`/api/invites/${token}/accept`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectsRootKey }),
  });
}
// ===================== END APPEND BLOCK (projects/members/invites) ==========
```

- [ ] **Step 2: failing test** — `apps/web/src/lib/active-project.test.tsx` (copy the `MemoryStorage` shim from `ProfileTab.test.tsx`):
```tsx
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActiveProjectProvider, useActiveProject } from './active-project';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });

const server = setupServer(
  http.get('/api/projects', () =>
    HttpResponse.json([
      { id: 'p1', name: 'Alpha', vision: '', aboutMd: '', role: 'owner' },
      { id: 'p2', name: 'Beta', vision: '', aboutMd: '', role: 'viewer' },
    ]),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => localStorage.clear());
afterEach(() => { server.resetHandlers(); cleanup(); });
afterAll(() => server.close());

function Probe() {
  const { projectId, role, projects, setProjectId, isLoading } = useActiveProject();
  if (isLoading) return <p>loading</p>;
  return (
    <div>
      <p>active:{projectId}</p>
      <p>role:{role}</p>
      <p>count:{projects.length}</p>
      <button onClick={() => setProjectId('p2')}>switch</button>
    </div>
  );
}
function renderProbe() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ActiveProjectProvider><Probe /></ActiveProjectProvider>
    </QueryClientProvider>,
  );
}

describe('useActiveProject', () => {
  it('auto-selects the first project and exposes its role', async () => {
    renderProbe();
    await screen.findByText('active:p1');
    expect(screen.getByText('role:owner')).toBeTruthy();
    expect(screen.getByText('count:2')).toBeTruthy();
  });
  it('switching updates active project + role and persists to localStorage', async () => {
    renderProbe();
    await screen.findByText('active:p1');
    await userEvent.click(screen.getByRole('button', { name: 'switch' }));
    await screen.findByText('active:p2');
    expect(screen.getByText('role:viewer')).toBeTruthy();
    expect(localStorage.getItem('pm.activeProjectId')).toBe('p2');
  });
});
```

- [ ] **Step 3: run, confirm FAIL** — `pnpm --filter @productmap/web exec vitest run src/lib/active-project.test.tsx`

- [ ] **Step 4: implement `apps/web/src/lib/active-project.tsx`:**
```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MemberRole } from '@productmap/shared';
import { useProjects, type ProjectMembership } from './api';

const STORAGE_KEY = 'pm.activeProjectId';

interface ActiveProjectCtx {
  projectId: string | null;
  role: MemberRole | null;
  projects: ProjectMembership[];
  setProjectId: (id: string) => void;
  isLoading: boolean;
}

const Ctx = createContext<ActiveProjectCtx>({
  projectId: null, role: null, projects: [], setProjectId: () => {}, isLoading: true,
});

function readStored(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function ActiveProjectProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useProjects();
  const projects = useMemo(() => data ?? [], [data]);
  const [chosen, setChosen] = useState<string | null>(() => readStored());

  // Resolve the active id: persisted choice if still valid, else first project.
  const projectId = useMemo(() => {
    if (projects.length === 0) return null;
    if (chosen && projects.some((p) => p.id === chosen)) return chosen;
    return projects[0].id;
  }, [projects, chosen]);

  // Keep storage in sync with the resolved id (handles auto-select + stale ids).
  useEffect(() => {
    if (projectId) { try { localStorage.setItem(STORAGE_KEY, projectId); } catch { /* ignore */ } }
  }, [projectId]);

  const role = useMemo(
    () => projects.find((p) => p.id === projectId)?.role ?? null,
    [projects, projectId],
  );

  const value = useMemo<ActiveProjectCtx>(
    () => ({ projectId, role, projects, setProjectId: setChosen, isLoading }),
    [projectId, role, projects, isLoading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveProject() { return useContext(Ctx); }
```

- [ ] **Step 5: run, confirm PASS** (2 tests). Typecheck web → 0.

- [ ] **Step 6: commit**
```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/active-project.tsx apps/web/src/lib/active-project.test.tsx
git commit -m "feat(web): active-project provider + project/member/invite query hooks"
```

---

### Task 8: Project switcher (nav) + first-run gate wiring

**Files:** `apps/web/src/components/ProjectSwitcher.tsx` (new) + `.test.tsx`, `apps/web/src/routes/FirstRun.tsx` (new) + `.test.tsx`, `apps/web/src/App.tsx`, `apps/web/src/components/AppShell.tsx`.

- [ ] **Step 1: failing test** — `apps/web/src/components/ProjectSwitcher.test.tsx` (mirror `active-project.test.tsx` msw + MemoryStorage setup; the switcher reads `useActiveProject`, so wrap in the provider):
```tsx
// setup: same MemoryStorage shim + msw GET /api/projects returning [Alpha owner, Beta viewer]
describe('ProjectSwitcher', () => {
  it('lists the caller’s projects and switches on select', async () => {
    renderInProvider(<ProjectSwitcher />); // helper: wraps in QueryClient + ActiveProjectProvider
    await screen.findByText('Alpha');               // current project name shown on the trigger
    await userEvent.click(screen.getByRole('button', { name: /switch project/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Beta' }));
    await waitFor(() => expect(localStorage.getItem('pm.activeProjectId')).toBe('p2'));
  });
});
```

- [ ] **Step 2: run, confirm FAIL.**

- [ ] **Step 3: implement `ProjectSwitcher.tsx`** using the existing `DropdownMenu` primitives (same as AppShell's Plan menu) and `useActiveProject`. Trigger shows the active project name; menu lists `projects` with `setProjectId(p.id)` on click; a "New project…" item navigates to `/?new=1` or opens the create dialog (reuse FirstRun's form — keep it minimal: link to a create affordance). Provide `aria-label="Switch project"` on the trigger and `role="menuitem"` items (DropdownMenuItem already renders that role). Guard `projects.length === 0` → render nothing (first-run gate handles that case).

- [ ] **Step 4: implement `FirstRun.tsx`** — shown when the user has no memberships. A single card: name input + "Create project" calling `useCreateProject`; on success it invalidates `projects-list` (the provider re-selects), so the app renders normally. Test: render with msw `GET /api/projects → []` and `POST /api/projects → {id:'p9',name:'My App',role:'owner'}`; type a name, submit, assert the POST body `{ name: 'My App' }`.

- [ ] **Step 5: wire `App.tsx`.** Wrap the authed shell branch in `<ActiveProjectProvider>` and gate on first-run. Replace the `<Route element={<RequireAuth><AppShell/></RequireAuth>}>` wrapper element with one that provides active-project context and renders `<FirstRun/>` when `projects.length === 0`:
```tsx
import { ActiveProjectProvider, useActiveProject } from '@/lib/active-project';
const FirstRunPage = lazy(() => import('@/routes/FirstRun'));

function AuthedShell() {
  const { projects, isLoading } = useActiveProject();
  if (isLoading) return null;
  if (projects.length === 0) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <FirstRunPage />
      </Suspense>
    );
  }
  return <AppShell />;
}
```
Change the route wrapper to:
```tsx
<Route element={<RequireAuth><ActiveProjectProvider><AuthedShell /></ActiveProjectProvider></RequireAuth>}>
```
(`AuthedShell` must be rendered INSIDE the provider so `useActiveProject` resolves.)

- [ ] **Step 6: mount the switcher in `AppShell.tsx`** — add `<ProjectSwitcher />` in the left nav cluster (after the ProductMap logo `<Link>`, before `NAV_LINKS`). Import it at top.

- [ ] **Step 7: run web tests, confirm PASS;** typecheck web → 0.

- [ ] **Step 8: commit**
```bash
git add apps/web/src/components/ProjectSwitcher.tsx apps/web/src/components/ProjectSwitcher.test.tsx apps/web/src/routes/FirstRun.tsx apps/web/src/routes/FirstRun.test.tsx apps/web/src/App.tsx apps/web/src/components/AppShell.tsx
git commit -m "feat(web): project switcher in nav + first-run create gate"
```

---

### Task 9: Project settings tab (rename / members / invites / delete)

**Files:** `apps/web/src/components/settings/ProjectTab.tsx` (new) + `.test.tsx`, `apps/web/src/App.tsx` (add `project` settings route), `apps/web/src/routes/Settings.tsx` (add the tab link).

Owner/super-admin-only management; the API enforces it (403/404), the UI mirrors it. Read the active project + role from `useActiveProject`.

- [ ] **Step 1: failing test** — `ProjectTab.test.tsx` (MemoryStorage + msw; mock `GET /api/projects`, `GET .../members`, `GET .../invites`, and the mutation endpoints). Cover, at minimum:
  - **owner** sees the rename form, members list, invite generator, and a Delete button.
  - **viewer** (active role `viewer`) sees a read-only notice and NO mutation controls (rename input disabled/hidden, no Delete, no invite generator) — this is the role-aware assertion for settings.
  - Generating a link-only invite shows the copyable URL `/invite/<token>` (assert it renders the token returned by msw); `emailSent:false` shows a "link only (email not configured)" hint.
  - Adding a member by email PATCHes/POSTs the right body; last-owner demote/remove surfaces the server 409 message via `apiErrorMessage`.

- [ ] **Step 2: run, confirm FAIL.**

- [ ] **Step 3: implement `ProjectTab.tsx`.** Structure (reuse `Card`, `Button`, `Input`, `Label`, `select`, `toast`, `apiErrorMessage` exactly as `UsersTab.tsx` does):
  - **Header guard:** `const { projectId, role } = useActiveProject();` If `role !== 'owner'` (and not super-admin — note: super-admin shows as `owner` via 2b-1's list, so `role === 'owner'` covers it) render the project **name read-only** + a muted "Only owners can manage this project." Still allow viewing members (read-only list) since `GET members` is viewer-allowed.
  - **Rename block:** controlled input seeded from the active project's name; Save calls `useUpdateProject` (already in `api.ts`); invalidate `projects-list` on success.
  - **Members block:** `useProjectMembers(projectId)` list with per-row role `<select>` (`useUpdateMember`) + Remove (`useRemoveMember`); an "Add by email" form (`useAddMember`). Surface 409 (`last_owner`) and 404 (`user_not_found`) via `apiErrorMessage` toasts.
  - **Invites block:** `useProjectInvites(projectId)` list (token, role, email, expiresAt) with Revoke (`useRevokeInvite`); a "Generate invite" form (role select + optional email) using `useCreateInvite`. On success show the copyable `${location.origin}/invite/${token}` with a Copy button (mirror `UsersTab`'s `TempPasswordCallout` copy pattern). If `emailSent === false` and an email was supplied, show "Email not configured — share this link manually."
  - **Danger zone:** Delete button (confirm) → `useDeleteProject(projectId)`; on success clear active project (the provider re-selects from the invalidated list) and toast.

- [ ] **Step 4: add the route + nav link.** In `App.tsx` Settings children, add:
```tsx
const ProjectTab = lazy(() => import('@/components/settings/ProjectTab'));
```
```tsx
<Route path="project" element={<ProjectTab />} />
```
Add a "Project" tab link in `Settings.tsx`'s tab strip (mirror how `workspace`/`profile`/`users` links are rendered there — read that file to match exactly).

- [ ] **Step 5: run web tests PASS;** typecheck web → 0.

- [ ] **Step 6: commit**
```bash
git add apps/web/src/components/settings/ProjectTab.tsx apps/web/src/components/settings/ProjectTab.test.tsx apps/web/src/App.tsx apps/web/src/routes/Settings.tsx
git commit -m "feat(web): project settings tab — rename, members, invites, delete (role-gated)"
```

---

### Task 10: Accept-invite page `/invite/:token`

**Files:** `apps/web/src/routes/AcceptInvite.tsx` (new) + `.test.tsx`, `apps/web/src/App.tsx` (route).

The page previews the invite, requires auth (redirect to `/login?next=/invite/:token` when logged out), and accepts on click → navigates into the project.

- [ ] **Step 1: failing test** — `AcceptInvite.test.tsx` (MemoryStorage + msw, render under `MemoryRouter` with `initialEntries={['/invite/tok1']}` and an `AuthProvider`/`useAuth` stub or msw `GET /api/auth/me`):
  - authed + valid token → shows project name + role + an "Accept" button; clicking it POSTs `/api/invites/tok1/accept` and (assert) navigates to `/`.
  - expired preview (`expired:true`) → shows "This invite has expired" and no Accept button.
  - unknown/revoked token (preview 404) → shows "Invite not found or revoked."
  - logged-out (`GET /api/auth/me` → 401) → redirects to `/login` with the next param (assert the rendered Login route or the Navigate target).

- [ ] **Step 2: run, confirm FAIL.**

- [ ] **Step 3: implement `AcceptInvite.tsx`:**
  - `const { token } = useParams()`. `const { me, isLoading } = useAuth();` If `isLoading` → null. If `!me` → `<Navigate to={\`/login?next=/invite/${token}\`} replace />` (confirm Login reads a `next`/`from` param; if it only supports `state.from`, pass via `state` instead — read `Login.tsx` to match).
  - `useInvitePreview(token)`: loading skeleton; error (404) → "not found or revoked" card; `data.expired` → "expired" card.
  - Else card: `{data.projectName}` + `as {data.role}` + Accept button → `useAcceptInvite().mutate(token, { onSuccess: ({projectId}) => { localStorage.setItem('pm.activeProjectId', projectId); navigate('/'); } })`. Setting the storage key makes the just-joined project active on landing.

- [ ] **Step 4: add the route in `App.tsx`** — public-ish but auth-redirecting; place it OUTSIDE `AppShell` (like `/share/:token`) and wrap in `<Suspense>`:
```tsx
const AcceptInvitePage = lazy(() => import('@/routes/AcceptInvite'));
```
```tsx
<Route
  path="/invite/:token"
  element={
    <Suspense fallback={<RouteFallback />}>
      <AcceptInvitePage />
    </Suspense>
  }
/>
```
(It must be reachable without the active-project provider/first-run gate, so keep it a sibling of `/share/:token`, inside `<AuthProvider>` but outside the `RequireAuth><ActiveProjectProvider>` block. The page does its own auth check + redirect.)

- [ ] **Step 5: run web tests PASS;** typecheck web → 0.

- [ ] **Step 6: commit**
```bash
git add apps/web/src/routes/AcceptInvite.tsx apps/web/src/routes/AcceptInvite.test.tsx apps/web/src/App.tsx
git commit -m "feat(web): accept-invite page /invite/:token (preview, auth-redirect, join)"
```

---

### Task 11: Role-aware UI — viewers see read-only

**Files:** a small shared helper + targeted edits to mutation entry points. Read the active role from `useActiveProject` (single source — no extra fetch).

The server is the authority (viewer writes already 403/404 post-2b). This task makes the UI **reflect** that: hide or disable mutation affordances when `role === 'viewer'`. Keep it lean — gate the primary create/edit entry points, not every byte.

- [ ] **Step 1: helper + failing test.** Add to `active-project.tsx`:
```tsx
/** True when the active role can mutate project content (editor or owner). */
export function useCanEdit(): boolean {
  const { role } = useActiveProject();
  return role === 'editor' || role === 'owner';
}
```
Add a test in `active-project.test.tsx`: with role `viewer`, `useCanEdit()` is false; with `owner`/`editor`, true (drive via the `Probe` rendering `canEdit:{String(useCanEdit())}` and switching projects).

- [ ] **Step 2: run, confirm FAIL → implement → PASS.**

- [ ] **Step 3: apply `useCanEdit()` at the principal mutation entry points.** For each, when `!canEdit`, hide the affordance (preferred) or disable it with a tooltip "Read-only — you have viewer access." Cover the highest-traffic ones (read each file first to place the gate correctly):
  - Board: the "New feature" / add-card control (`apps/web/src/routes/Board.tsx` or its card components).
  - Feature page: edit/save/status controls, evidence/dependencies/decision creators (`apps/web/src/routes/FeaturePage.tsx`).
  - Inbox: "New idea" + promote (`apps/web/src/routes/Inbox.tsx`).
  - Releases/Outcomes: create buttons (`apps/web/src/routes/Releases.tsx`, `Outcomes.tsx`).
  - Doc editor: it's acceptable to show the editor read-only; at minimum hide the "New doc" entry point in `DocsPage.tsx`.
  - Settings → Project: already role-gated in Task 9.
  Write ONE focused web test per surface you gate (e.g. `Board.test.tsx`: with `role:'viewer'`, the "New feature" button is absent; with `role:'editor'`, present). Add the active-project provider + msw `GET /api/projects` to those tests.

- [ ] **Step 4: run the full web suite PASS;** typecheck web → 0.

- [ ] **Step 5: commit**
```bash
git add apps/web/src
git commit -m "feat(web): role-aware UI — viewers see content read-only (useCanEdit)"
```

---

### Task 12: STAGE B verification (web DoD)
- [ ] `pnpm --filter @productmap/web exec tsc -p tsconfig.json --noEmit` → 0.
- [ ] `pnpm --filter @productmap/web exec vitest run` → all green (provider, switcher, first-run, project tab, accept-invite, role-aware suites).
- [ ] Manual (dev server, two browser profiles): owner generates a link → second user opens `/invite/:token` → accepts → lands in the project, sees it in the switcher; viewer cannot create features (control hidden); first-run shows for a user with no memberships; rename/delete reflected; last-owner demote shows the 409 message.

---

## Final verification (Phase 2c DoD)
- [ ] **Typecheck:** `pnpm --filter @productmap/api exec tsc -p tsconfig.json --noEmit`, web tsc, shared tsc, db tsc → all 0. (Ignore `@productmap/db has no exported member` LSP noise.)
- [ ] **Full suite green:** `pnpm test` (sandbox OFF for the api/DB suites on `:5432`). API count grows by the mailer + invite suites; web grows by the provider/switcher/first-run/project-tab/accept-invite/role-aware suites.
- [ ] **Build clean:** `pnpm build`.
- [ ] **Invites matrix proven (spec §14):** create → accept → membership row; expiry → 410; revoke → 404; email-binding (matching accepts); wrong-email → 403; accept-when-already-member idempotent (no downgrade); owner-only create/revoke (editor → 403, non-member → 404).
- [ ] **SMTP optional + offline-first:** with no `SMTP_*` env, invite create returns `emailSent:false` and the no-op mailer is never sent through (proven by `mailer.test.ts`); with an injected transport, `sendMail` is called.
- [ ] **Web deliverables present:** switcher lists memberships (super-admin sees all via 2b-1's list), first-run for zero-membership users, project settings (rename/members/invites/delete) role-gated, `/invite/:token` accept page, role-aware UI (viewers read-only) driven by the single `useActiveProject` role.
- [ ] **No Phase-1/2a/2b regressions:** auth, share read, and existing route suites still green.
- [ ] **Migration checked in:** the generated `invites` migration + `meta/_journal.json` are committed; `invites` added to `truncateAll`.

## Notes for the executor
- **Single source of role/active project:** the switcher (write), first-run (`projects.length===0`), settings gate, and role-aware UI (`useCanEdit`) all read `useActiveProject()` — do NOT introduce a second `GET /api/projects` fetch or a separate role source.
- **Auth boundaries:** create/revoke are `requireMembership('owner')` under `/api/projects/:projectId/invites`; preview/accept are top-level `/api/invites/:token` behind plain `requireAuth` (NOT membership — the joiner isn't a member yet). Preview defaults to **auth-required** (consistent with the global `/api/*` gate). If logged-out previews are later desired, add `GET /api/invites/` to the public allowlist in `app.ts` (like `share` GET) and have the web page skip the login redirect — out of scope for v1; default to auth-required.
- **nodemailer stays optional:** the lazy `import('nodemailer')` runs only when `SMTP_*` is set; the air-gapped default needs no mail dependency. Add it to deps only if CI requires the dynamic import to resolve at build time.
- **`expiresAt` is a JS `Date` from Drizzle** (timestamp with tz) — compare with `.getTime()` as the code does; the API serializes it to ISO for the web `Invite`/`InvitePreview` types.
- **Read before you wire:** confirm `AuthEnv`/`currentUser` shape in `middleware/auth.ts`, the `Login.tsx` next/from convention, and the `Settings.tsx` tab-strip pattern before editing — match existing conventions exactly.
- **Dependency reminder:** if `apps/api/src/middleware/membership.ts` or the expanded `projectsRoutes` (members) are absent, 2b-1 is not merged — stop and surface it; this plan builds directly on them.

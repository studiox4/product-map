// The demo runtime entry point. Spins up an in-memory PGlite database, applies
// the real migrations, seeds it with the demo workspace, injects it into the
// real Hono `app` via configureDb, mints a demo auth cookie, and exposes a
// `demoFetch` that drives the real `app.fetch` — so the demo answers requests
// with the exact production route logic, just against an in-page database.
//
import type { User } from '@productmap/shared';
import { setActiveFetch } from '../lib/api';
import { app } from '../../../../apps/api/src/app';
import { configureDb } from '../../../../apps/api/src/db';
import { markdownToTiptap } from '../../../../apps/api/src/lib/markdown';
import { seedDemo } from '../../../../packages/db/src/seed-data';
import { projects } from '../../../../packages/db/src/schema';
import type { Db } from '../../../../packages/db/src/index';
import { createDemoDb } from './demoDb';
import { mintDemoCookie, DEMO_USER_ID } from './demoSession';
import { demoReady, getDemoProjectId, setDemoEnabled } from './demoState';

// Re-export the lightweight state helpers so existing importers (and tests)
// that reach for them via this module keep working. New synchronous callers in
// the render path MUST import from './demoState' directly so the heavy graph
// above never lands in their chunk.
export { app, DEMO_USER_ID, demoReady, getDemoProjectId };

let _enabled = false;
let _cookie: string | null = null;

/**
 * The demo user, shaped like the app's `User` type (what `useMe()` returns).
 * Mirrors the seeded demo user in packages/db/src/seed-data so the avatar
 * colour and name match the data the demo backend serves.
 */
export function getDemoUser(): User {
  return {
    id: DEMO_USER_ID,
    name: 'Corban',
    color: '#2b557e',
    role: 'admin',
  };
}

/** Query the seeded project id from the demo database (single seeded project). */
async function loadSeededProjectId(db: Db): Promise<string> {
  const [project] = await db.select({ id: projects.id }).from(projects).limit(1);
  if (!project) throw new Error('Demo seed produced no project');
  return project.id;
}

/**
 * Idempotently bring up the demo runtime. Safe to call multiple times.
 */
export async function enableDemo(): Promise<void> {
  if (_enabled) return;

  const { db } = await createDemoDb();
  configureDb(db);

  // Stub the password hasher so @node-rs/argon2 (a native node addon) never
  // enters the browser graph — the demo never logs in, so the hash is cosmetic.
  await seedDemo(db, markdownToTiptap, async () => 'demo-no-login');

  _cookie = await mintDemoCookie();
  const projectId = await loadSeededProjectId(db);
  _enabled = true;
  setDemoEnabled(projectId);

  // Route all of api.ts's I/O through the in-page demo backend.
  setActiveFetch(demoFetch);
}

/**
 * A `fetch`-compatible function that routes every request through the real
 * in-page Hono `app`, attaching the demo auth cookie. Normalizes relative URLs
 * (e.g. "/api/...") against a synthetic origin; the resulting Request carries no
 * `Origin` header, so the app's CSRF same-origin check passes for mutations.
 */
export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!_enabled || !_cookie) {
    throw new Error('Demo not enabled — call enableDemo() before demoFetch');
  }

  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const url = new URL(rawUrl, 'http://demo.local');

  // Merge incoming headers, then force our demo cookie (replacing any existing).
  const headers = new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
  headers.set('Cookie', _cookie);

  const request = new Request(url.toString(), { ...init, headers });
  return app.fetch(request);
}

// Public, unauthenticated idea-intake endpoints (E5).
//   GET  /api/intake/:token  — form metadata (project name + intro). Opaque 404.
//   POST /api/intake/:token  — accept a public submission. Re-validates the token.
import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { projects, shareTokens, ideas } from '@productmap/db/schema';
import type { AuthEnv } from '../middleware/auth';
import type { IntakeConfig } from '@productmap/shared';
import { intakeSubmit } from '@productmap/shared';
import { RateLimiter, clientIp } from '../lib/rate-limit';
import { fanOutIdeaSubmittedNotification } from '../lib/notifications';

// Per-process limiters (best-effort on multi-instance Railway).
export const ipLimiter = new RateLimiter({ max: 5, windowMs: 60_000 });
export const tokenLimiter = new RateLimiter({ max: 20, windowMs: 3_600_000 });

/** Reset both intake limiters — for use in tests to prevent cross-test contamination. */
export function __resetIntakeLimiters() { ipLimiter.reset(); tokenLimiter.reset(); }

/** Load an active (non-revoked, non-expired) intake token, or null. */
async function loadActiveIntakeToken(token: string) {
  const [row] = await db
    .select()
    .from(shareTokens)
    .where(and(eq(shareTokens.token, token), isNull(shareTokens.revokedAt)));
  if (!row) return null;
  if (row.kind !== 'intake') return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

export const publicIntakeRoutes = new Hono<AuthEnv>()
  .get('/:token', async (c) => {
    const row = await loadActiveIntakeToken(c.req.param('token'));
    if (!row) return c.json({ error: 'not_found' }, 404);
    const [project] = await db.select().from(projects).where(eq(projects.id, row.projectId));
    if (!project) return c.json({ error: 'not_found' }, 404);
    // Fail-closed default handled at submit; meta only needs intro copy.
    const config = (row.config as IntakeConfig | null) ?? { introMd: '', moderation: true };
    return c.json({ projectName: project.name, introMd: config.introMd, active: true });
  })
  .post('/:token', async (c) => {
    // Invariant 1: the POST re-validates the token — never trust a loaded form.
    const row = await loadActiveIntakeToken(c.req.param('token'));
    if (!row) return c.json({ error: 'not_found' }, 404);

    // Rate-limit per-IP and per-token.
    const ip = await clientIp(c);
    if (!ipLimiter.hit(`intake:ip:${ip}`)) return c.json({ error: 'rate_limited' }, 429);
    if (!tokenLimiter.hit(`intake:tok:${row.token}`)) return c.json({ error: 'rate_limited' }, 429);

    const bodyText = await c.req.text();
    let raw: unknown = {};
    if (bodyText.trim() !== '') {
      try {
        raw = JSON.parse(bodyText);
      } catch {
        return c.json({ error: 'bad_request', issues: [{ message: 'Invalid JSON body' }] }, 400);
      }
    }

    // Honeypot: check raw body BEFORE Zod validation. The schema enforces
    // website: max(0), so a non-empty website would otherwise return 400 — but
    // the security invariant requires a silent 201 (no insert, no error leak).
    const rawObj = (typeof raw === 'object' && raw !== null) ? raw as Record<string, unknown> : {};
    if (typeof rawObj.website === 'string' && rawObj.website !== '') {
      return c.json({ ok: true }, 201);
    }

    const parsed = intakeSubmit.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
    const { title, bodyMd, submitterName, submitterEmail } = parsed.data;

    // Invariant 2: fail closed — absent config or absent moderation key ⇒ moderated.
    // `config.moderation !== false` ensures undefined (key missing) is treated as true.
    const config = (row.config as IntakeConfig | null) ?? { introMd: '', moderation: true };
    const status = config.moderation !== false ? ('pending' as const) : ('inbox' as const);

    const [idea] = await db
      .insert(ideas)
      // Invariant 3: projectId from the token, never the client.
      .values({
        projectId: row.projectId,
        title,
        bodyMd,
        source: 'public',
        status,
        submitterName: submitterName ?? null,
        submitterEmail: submitterEmail ?? null,
        createdBy: null,
      })
      .returning();

    if (status === 'pending') {
      await fanOutIdeaSubmittedNotification({ projectId: row.projectId, ideaId: idea.id, title: idea.title });
    }
    // Invariant 4: opaque success — no idea id, no PII echoed.
    return c.json({ ok: true }, 201);
  });

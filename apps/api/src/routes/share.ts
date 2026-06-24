// Public roadmap sharing: mint/revoke opaque tokens and serve a read-only
// aggregate.
//
// publicShareRoutes — top-level at /api/share (public GET, authed DELETE):
//   GET  /:token/data  — unauthenticated; data scoped to the token's project.
//   DELETE /:token     — revoke; requires auth + membership on the token's project.
//
// shareMintRoutes — nested at /api/projects/:projectId/share (editor-gated by method gate):
//   POST /roadmap      — mint a token for c.get('currentProjectId').
import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { projects, features, documents, releases, shareTokens, memberships } from '@productmap/db/schema';
import type { AuthEnv } from '../middleware/auth';
import type { MembershipEnv } from '../middleware/membership';
import type { DocumentMeta, FeatureWithDocs, Horizon, ShareData } from '@productmap/shared';
import { EMPTY_VOTE_SUMMARY, voteSummaries } from '../lib/votes';

const HORIZON_ORDER: Record<Horizon, number> = { now: 0, next: 1, later: 2 };

// ---------------------------------------------------------------------------
// Public reader + authed revoke
// ---------------------------------------------------------------------------

export const publicShareRoutes = new Hono<AuthEnv>()
  // GET /api/share/:token/data → read-only {product, features, releases}.
  // Runs unauthenticated — the global allowlist admits GET /api/share/* without auth.
  .get('/:token/data', async (c) => {
    const [tokenRow] = await db
      .select()
      .from(shareTokens)
      .where(and(eq(shareTokens.token, c.req.param('token')), isNull(shareTokens.revokedAt)));
    if (!tokenRow) return c.json({ error: 'not_found' }, 404);

    const [project] = await db.select().from(projects).where(eq(projects.id, tokenRow.projectId));
    if (!project) return c.json({ error: 'not_found' }, 404);

    const featureRows = await db
      .select()
      .from(features)
      .where(eq(features.projectId, tokenRow.projectId));
    featureRows.sort(
      (a, b) =>
        HORIZON_ORDER[a.horizon] - HORIZON_ORDER[b.horizon] ||
        a.sortOrder - b.sortOrder ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const docRows = await db
      .select({
        id: documents.id,
        featureId: documents.featureId,
        type: documents.type,
        title: documents.title,
        status: documents.status,
        cover: documents.cover,
        createdBy: documents.createdBy,
        updatedBy: documents.updatedBy,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .innerJoin(features, eq(documents.featureId, features.id))
      .where(eq(features.projectId, tokenRow.projectId));

    const docsByFeature = new Map<string, DocumentMeta[]>();
    for (const d of docRows) {
      if (!d.featureId) continue; // inner join guarantees this; narrows the type
      const meta: DocumentMeta = {
        ...d,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      };
      const list = docsByFeature.get(d.featureId) ?? [];
      list.push(meta);
      docsByFeature.set(d.featureId, list);
    }
    for (const list of docsByFeature.values()) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    // Anonymous viewer: aggregate vote scores, never a personal myVote.
    const voteMap = await voteSummaries(
      featureRows.map((f) => f.id),
      null,
    );

    const featuresWithDocs: FeatureWithDocs[] = featureRows.map((f) => ({
      ...(voteMap.get(f.id) ?? EMPTY_VOTE_SUMMARY),
      ...f,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
      documents: docsByFeature.get(f.id) ?? [],
    }));

    // FIX: scope releases to this token's project (was unfiltered before — leaked other projects).
    const releaseRows = await db
      .select()
      .from(releases)
      .where(eq(releases.projectId, tokenRow.projectId));
    releaseRows.sort(
      (a, b) =>
        (a.targetDate ?? '9999-12-31').localeCompare(b.targetDate ?? '9999-12-31') ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const response: ShareData = {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug ?? '',
        vision: project.vision,
        aboutMd: project.aboutMd,
      },
      features: featuresWithDocs,
      releases: releaseRows.map((r) => ({
        ...r,
        shippedAt: r.shippedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
    return c.json(response);
  })
  // DELETE /api/share/:token → revoke. Requires auth (non-public) + membership on the token's project.
  // The global middleware already enforces requireAuth on non-public DELETE paths.
  .delete('/:token', async (c) => {
    const user = c.get('currentUser');
    if (!user) return c.json({ error: 'unauthorized' }, 401);

    // Load the active token row first — unknown/already-revoked → 404 before any membership check.
    const [tokenRow] = await db
      .select()
      .from(shareTokens)
      .where(and(eq(shareTokens.token, c.req.param('token')), isNull(shareTokens.revokedAt)));
    if (!tokenRow) return c.json({ error: 'not_found' }, 404);

    // Membership check: super-admin bypasses; otherwise require any membership role on the token's project.
    if (user.role !== 'admin') {
      const [m] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, user.id), eq(memberships.projectId, tokenRow.projectId)))
        .limit(1);
      if (!m) return c.json({ error: 'not_found' }, 404);
    }

    const [row] = await db
      .update(shareTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareTokens.token, c.req.param('token')), isNull(shareTokens.revokedAt)))
      .returning();
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  });

// ---------------------------------------------------------------------------
// Nested mint (editor-gated via method gate in project-scoped.ts)
// ---------------------------------------------------------------------------

export const shareMintRoutes = new Hono<MembershipEnv>()
  // POST /api/projects/:projectId/share/roadmap → mint a share link.
  .post('/roadmap', async (c) => {
    const token = nanoid();
    const projectId = c.get('currentProjectId');
    await db.insert(shareTokens).values({ projectId, token, kind: 'roadmap' });
    return c.json({ url: `/share/${token}` }, 201);
  });

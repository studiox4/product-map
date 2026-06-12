// Public roadmap sharing: mint/revoke opaque tokens and serve a read-only
// aggregate. Every route here works with NO x-user-id header — the share page
// runs in a fresh, unauthenticated context.
import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { products, features, documents, releases, shareTokens } from '@productmap/db';
import type { DocumentMeta, FeatureWithDocs, Horizon, ShareData } from '@productmap/shared';
import { EMPTY_VOTE_SUMMARY, voteSummaries } from '../lib/votes';

const HORIZON_ORDER: Record<Horizon, number> = { now: 0, next: 1, later: 2 };

export const shareRoutes = new Hono()
  // POST /api/share/roadmap → mint a share link.
  .post('/roadmap', async (c) => {
    const token = nanoid();
    await db.insert(shareTokens).values({ token, kind: 'roadmap' });
    return c.json({ url: `/share/${token}` }, 201);
  })
  // DELETE /api/share/:token → revoke. 404 when unknown or already revoked.
  .delete('/:token', async (c) => {
    const [row] = await db
      .update(shareTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareTokens.token, c.req.param('token')), isNull(shareTokens.revokedAt)))
      .returning();
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  })
  // GET /api/share/:token/data → read-only {product, features, releases}.
  .get('/:token/data', async (c) => {
    const [tokenRow] = await db
      .select()
      .from(shareTokens)
      .where(and(eq(shareTokens.token, c.req.param('token')), isNull(shareTokens.revokedAt)));
    if (!tokenRow) return c.json({ error: 'not_found' }, 404);

    const [product] = await db.select().from(products).limit(1);
    if (!product) return c.json({ error: 'not_found' }, 404);

    const featureRows = await db
      .select()
      .from(features)
      .where(eq(features.productId, product.id));
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
      .where(eq(features.productId, product.id));

    const docsByFeature = new Map<string, DocumentMeta[]>();
    for (const d of docRows) {
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

    const releaseRows = await db.select().from(releases);
    releaseRows.sort(
      (a, b) =>
        (a.targetDate ?? '9999-12-31').localeCompare(b.targetDate ?? '9999-12-31') ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const response: ShareData = {
      product: {
        id: product.id,
        name: product.name,
        vision: product.vision,
        aboutMd: product.aboutMd,
      },
      features: featuresWithDocs,
      releases: releaseRows.map((r) => ({
        ...r,
        shippedAt: r.shippedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
    return c.json(response);
  });

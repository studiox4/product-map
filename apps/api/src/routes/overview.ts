import { Hono } from 'hono';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { projects, features, documents, comments } from '@productmap/db/schema';
import { EMPTY_VOTE_SUMMARY, requestUserId, voteSummaries } from '../lib/votes';
import type { MembershipEnv } from '../middleware/membership';
import type {
  AttentionItem,
  DocumentMeta,
  FeatureWithDocs,
  OverviewResponse,
  Horizon,
} from '@productmap/shared';

const HORIZON_ORDER: Record<Horizon, number> = { now: 0, next: 1, later: 2 };

export const overviewRoutes = new Hono<MembershipEnv>().get('/', async (c) => {
  const pid = c.get('currentProjectId');
  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) return c.json({ error: 'not_found' }, 404);

  const featureRows = await db
    .select()
    .from(features)
    .where(eq(features.projectId, pid));

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
    .where(eq(features.projectId, pid));

  const docsByFeature = new Map<string, DocumentMeta[]>();
  for (const d of docRows) {
    if (!d.featureId) continue; // idea/release-owned docs have no board card
    const meta: DocumentMeta = {
      id: d.id,
      featureId: d.featureId,
      type: d.type,
      title: d.title,
      status: d.status,
      cover: d.cover,
      createdBy: d.createdBy,
      updatedBy: d.updatedBy,
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

  const voteMap = await voteSummaries(
    featureRows.map((f) => f.id),
    requestUserId(c),
  );

  const featuresWithDocs: FeatureWithDocs[] = featureRows.map((f) => ({
    ...(voteMap.get(f.id) ?? EMPTY_VOTE_SUMMARY),
    id: f.id,
    projectId: f.projectId,
    title: f.title,
    horizon: f.horizon,
    status: f.status,
    startDate: f.startDate,
    endDate: f.endDate,
    sortOrder: f.sortOrder,
    descriptionMd: f.descriptionMd,
    size: f.size,
    riskMd: f.riskMd,
    objectiveId: f.objectiveId,
    releaseId: f.releaseId,
    createdBy: f.createdBy,
    updatedBy: f.updatedBy,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    documents: docsByFeature.get(f.id) ?? [],
  }));

  // Attention items: open_comments first, then doc items (draft / in_review),
  // then feature items (missing dates / no docs). Iterate features in display
  // order for stability.
  const attention: AttentionItem[] = [];

  // Unresolved root comments per feature, across the feature and its docs.
  // Scoped to this project: feature comments directly, doc comments via document join.
  const featureIdOfComment = sql<string>`coalesce(${comments.featureId}, ${documents.featureId})`;
  const openCommentRows = await db
    .select({ featureId: featureIdOfComment, count: sql<number>`count(*)::int` })
    .from(comments)
    .leftJoin(documents, eq(comments.documentId, documents.id))
    .where(and(
      isNull(comments.parentId),
      isNull(comments.resolvedAt),
      sql`(${comments.featureId} = any(select id from features where project_id = ${pid}) or ${documents.featureId} = any(select id from features where project_id = ${pid}))`,
    ))
    .groupBy(featureIdOfComment);
  const openByFeature = new Map(openCommentRows.map((r) => [r.featureId, r.count]));
  for (const f of featuresWithDocs) {
    const count = openByFeature.get(f.id) ?? 0;
    if (count > 0) {
      attention.push({ kind: 'open_comments', featureId: f.id, title: f.title, count });
    }
  }

  for (const f of featuresWithDocs) {
    for (const d of f.documents) {
      if (d.status === 'draft') {
        attention.push({
          kind: 'draft_doc',
          documentId: d.id,
          featureId: f.id,
          title: d.title,
          docType: d.type,
        });
      } else if (d.status === 'in_review') {
        attention.push({
          kind: 'in_review_doc',
          documentId: d.id,
          featureId: f.id,
          title: d.title,
          docType: d.type,
        });
      }
    }
  }
  for (const f of featuresWithDocs) {
    if (!f.startDate || !f.endDate) {
      attention.push({ kind: 'missing_dates', featureId: f.id, title: f.title });
    }
    if (f.documents.length === 0) {
      attention.push({ kind: 'no_docs', featureId: f.id, title: f.title });
    }
  }

  const response: OverviewResponse = {
    project: {
      id: project.id,
      name: project.name,
      vision: project.vision,
      aboutMd: project.aboutMd,
    },
    features: featuresWithDocs,
    attention,
  };
  return c.json(response);
});

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { products, features, documents } from '@productmap/db';
import type {
  AttentionItem,
  DocumentMeta,
  FeatureWithDocs,
  OverviewResponse,
  Horizon,
} from '@productmap/shared';

const HORIZON_ORDER: Record<Horizon, number> = { now: 0, next: 1, later: 2 };

export const overviewRoutes = new Hono().get('/', async (c) => {
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
      id: d.id,
      featureId: d.featureId,
      type: d.type,
      title: d.title,
      status: d.status,
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

  const featuresWithDocs: FeatureWithDocs[] = featureRows.map((f) => ({
    id: f.id,
    productId: f.productId,
    title: f.title,
    horizon: f.horizon,
    status: f.status,
    startDate: f.startDate,
    endDate: f.endDate,
    sortOrder: f.sortOrder,
    descriptionMd: f.descriptionMd,
    createdBy: f.createdBy,
    updatedBy: f.updatedBy,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    documents: docsByFeature.get(f.id) ?? [],
  }));

  // Attention items: doc items first (draft / in_review), then feature items
  // (missing dates / no docs). Iterate features in display order for stability.
  const attention: AttentionItem[] = [];
  for (const f of featuresWithDocs) {
    for (const d of f.documents) {
      if (d.status === 'draft') {
        attention.push({
          kind: 'draft_doc',
          documentId: d.id,
          featureId: d.featureId,
          title: d.title,
          docType: d.type,
        });
      } else if (d.status === 'in_review') {
        attention.push({
          kind: 'in_review_doc',
          documentId: d.id,
          featureId: d.featureId,
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
    product: {
      id: product.id,
      name: product.name,
      vision: product.vision,
      aboutMd: product.aboutMd,
    },
    features: featuresWithDocs,
    attention,
  };
  return c.json(response);
});

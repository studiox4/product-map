import { sql } from 'drizzle-orm';
import { createDb, products, features, documents, users, featureCollaborators, activity } from './index';

const connectionString = process.env.DATABASE_URL ?? 'postgres://localhost:5432/productmap';

// --- date helpers: "this month" / "next month" relative to today ---
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
const today = new Date();
const y = today.getUTCFullYear();
const m = today.getUTCMonth();
const thisMonth = (day: number) => iso(new Date(Date.UTC(y, m, day)));
const nextMonth = (day: number) => iso(new Date(Date.UTC(y, m + 1, day)));

// --- simple hardcoded Tiptap JSON builders (no markdown lib dependency) ---
function p(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}
function h(level: number, text: string) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}
function doc(...content: unknown[]) {
  return { type: 'doc', content };
}

const { db, pool } = createDb(connectionString);

try {
  // Idempotent: wipe everything first.
  await db.execute(
    sql`truncate table activity, feature_collaborators, uploads, documents, features, products, users restart identity cascade`,
  );

  const [corban] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();

  const [product] = await db
    .insert(products)
    .values({
      name: 'ProductMap',
      vision: 'Roadmaps and docs your security team will let you run.',
      aboutMd:
        'ProductMap is a self-hosted product planning workspace: a now-next-later board, a draggable Gantt roadmap, and a rich markdown document editor with AI drafting — all backed by your own Postgres, so nothing leaves your network.',
    })
    .returning();

  const featureRows = await db
    .insert(features)
    .values([
      // Now
      {
        productId: product.id,
        title: 'Rich markdown editor',
        horizon: 'now',
        status: 'in_progress',
        startDate: thisMonth(1),
        endDate: thisMonth(21),
        sortOrder: 0,
      },
      {
        productId: product.id,
        title: 'Now-next-later board',
        horizon: 'now',
        status: 'in_progress',
        startDate: thisMonth(8),
        endDate: thisMonth(28),
        sortOrder: 1,
      },
      // Next
      {
        productId: product.id,
        title: 'Gantt roadmap',
        horizon: 'next',
        status: 'planned',
        startDate: nextMonth(1),
        endDate: nextMonth(18),
        sortOrder: 0,
      },
      {
        productId: product.id,
        title: 'AI doc drafting',
        horizon: 'next',
        status: 'planned',
        startDate: nextMonth(10),
        endDate: nextMonth(28),
        sortOrder: 1,
      },
      // Later — two dated (so the landing hero shows ≥6 bars per AC2), two dateless
      // (→ unscheduled tray + attention).
      {
        productId: product.id,
        title: 'Comments & review',
        horizon: 'later',
        status: 'idea',
        startDate: nextMonth(20),
        endDate: nextMonth(38), // Date.UTC rolls over into the following month
        sortOrder: 0,
      },
      {
        productId: product.id,
        title: 'Up/down voting',
        horizon: 'later',
        status: 'idea',
        startDate: nextMonth(32),
        endDate: nextMonth(46),
        sortOrder: 1,
      },
      { productId: product.id, title: 'Realtime collaboration (Yjs)', horizon: 'later', status: 'idea', sortOrder: 2 },
      { productId: product.id, title: 'ECS deployment', horizon: 'later', status: 'idea', sortOrder: 3 },
    ])
    .returning();

  const byTitle = new Map(featureRows.map((f) => [f.title, f]));
  const editor = byTitle.get('Rich markdown editor')!;
  const gantt = byTitle.get('Gantt roadmap')!;

  await db.insert(documents).values([
    {
      featureId: editor.id,
      type: 'prd',
      title: 'Rich markdown editor — PRD',
      status: 'draft',
      contentJson: doc(
        h(1, 'Rich markdown editor — PRD'),
        h(2, 'Overview'),
        p('A Tiptap-based editor that round-trips markdown so PMs can write PRDs, specs, and briefs without leaving ProductMap.'),
        h(2, 'Problem & opportunity'),
        p('Product docs live in scattered tools that security teams will not approve. A built-in editor keeps docs next to the roadmap items they describe.'),
        h(2, 'Requirements'),
        p('Must: headings, lists, tables, task lists, images, code blocks. Should: slash commands. Won’t (demo): realtime collaboration.'),
      ),
      contentMd: [
        '# Rich markdown editor — PRD',
        '',
        '## Overview',
        '',
        'A Tiptap-based editor that round-trips markdown so PMs can write PRDs, specs, and briefs without leaving ProductMap.',
        '',
        '## Problem & opportunity',
        '',
        'Product docs live in scattered tools that security teams will not approve. A built-in editor keeps docs next to the roadmap items they describe.',
        '',
        '## Requirements',
        '',
        'Must: headings, lists, tables, task lists, images, code blocks. Should: slash commands. Won’t (demo): realtime collaboration.',
      ].join('\n'),
    },
    {
      featureId: editor.id,
      type: 'tech_spec',
      title: 'Rich markdown editor — Tech spec',
      status: 'in_review',
      contentJson: doc(
        h(1, 'Rich markdown editor — Tech spec'),
        h(2, 'Summary'),
        p('Tiptap JSON is the source of truth; markdown is derived server-side on every save via a shared extension list.'),
        h(2, 'Proposed design'),
        p('Client edits Tiptap JSON and PATCHes documents. The API converts JSON to HTML to markdown (turndown + GFM) in the same transaction, keeping contentMd consistent for export.'),
        h(2, 'Open questions'),
        p('Do we need image resizing in the demo, or is upload + inline render enough?'),
      ),
      contentMd: [
        '# Rich markdown editor — Tech spec',
        '',
        '## Summary',
        '',
        'Tiptap JSON is the source of truth; markdown is derived server-side on every save via a shared extension list.',
        '',
        '## Proposed design',
        '',
        'Client edits Tiptap JSON and PATCHes documents. The API converts JSON to HTML to markdown (turndown + GFM) in the same transaction, keeping contentMd consistent for export.',
        '',
        '## Open questions',
        '',
        'Do we need image resizing in the demo, or is upload + inline render enough?',
      ].join('\n'),
    },
    {
      featureId: gantt.id,
      type: 'feature_brief',
      title: 'Gantt roadmap — Feature brief',
      status: 'final',
      contentJson: doc(
        h(1, 'Gantt roadmap — Feature brief'),
        h(2, 'Problem'),
        p('Stakeholders ask "when?" and the now-next-later board cannot answer; teams export to spreadsheets that rot immediately.'),
        h(2, 'Proposed solution'),
        p('An SVG Gantt with draggable, resizable bars synced to feature dates, plus an unscheduled tray for dateless work.'),
        h(2, 'Success metric'),
        p('A PM can reschedule a feature in under five seconds with no page reload, and the change survives refresh.'),
      ),
      contentMd: [
        '# Gantt roadmap — Feature brief',
        '',
        '## Problem',
        '',
        'Stakeholders ask "when?" and the now-next-later board cannot answer; teams export to spreadsheets that rot immediately.',
        '',
        '## Proposed solution',
        '',
        'An SVG Gantt with draggable, resizable bars synced to feature dates, plus an unscheduled tray for dateless work.',
        '',
        '## Success metric',
        '',
        'A PM can reschedule a feature in under five seconds with no page reload, and the change survives refresh.',
      ].join('\n'),
    },
  ]);

  // Attribute everything in the seed to Corban.
  await db.update(features).set({ createdBy: corban.id, updatedBy: corban.id });
  await db.update(documents).set({ createdBy: corban.id, updatedBy: corban.id });

  // Corban collaborates on the two documented features.
  await db.insert(featureCollaborators).values([
    { featureId: editor.id, userId: corban.id },
    { featureId: gantt.id, userId: corban.id },
  ]);

  // A little history on "Rich markdown editor" so the feature page feed isn't empty.
  await db.insert(activity).values([
    { featureId: editor.id, actorId: corban.id, kind: 'feature_created', payload: { to: editor.title } },
    {
      featureId: editor.id,
      actorId: corban.id,
      kind: 'doc_created',
      payload: { to: 'Rich markdown editor — PRD' },
    },
    { featureId: editor.id, actorId: corban.id, kind: 'status_changed', payload: { from: 'planned', to: 'in_progress' } },
    {
      featureId: editor.id,
      actorId: corban.id,
      kind: 'dates_changed',
      payload: {
        from: { startDate: null, endDate: null },
        to: { startDate: editor.startDate, endDate: editor.endDate },
      },
    },
  ]);

  console.log(`seeded: 1 product, ${featureRows.length} features, 3 documents, 1 user`);
} finally {
  await pool.end();
}

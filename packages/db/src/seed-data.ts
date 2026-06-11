// Demo seed data, callable both from the CLI runner (src/seed.ts) and from the
// API's POST /api/admin/reset-demo route. The markdown→Tiptap converter lives in
// apps/api/src/lib, so callers inject it (keeps this package dependency-light).
import { sql } from 'drizzle-orm';
import { TEMPLATES } from '@productmap/templates';
import {
  products,
  features,
  documents,
  users,
  featureCollaborators,
  activity,
  comments,
  votes,
  templates,
  type Db,
} from './index';

export type MarkdownToTiptap = (md: string) => unknown;

// --- date helpers: "this month" / "next month" relative to today ---
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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

export async function seedDemo(db: Db, markdownToTiptap: MarkdownToTiptap): Promise<void> {
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const thisMonth = (day: number) => iso(new Date(Date.UTC(y, m, day)));
  const nextMonth = (day: number) => iso(new Date(Date.UTC(y, m + 1, day)));

  // Idempotent: wipe everything first.
  await db.execute(
    sql`truncate table comments, votes, activity, feature_collaborators, uploads, documents, features, products, templates, users restart identity cascade`,
  );

  const [corban] = await db.insert(users).values({ name: 'Corban', color: '#2b557e' }).returning();

  // Built-in document templates: one default per doc type, body authored in
  // @productmap/templates as markdown ({{title}} preserved as literal text).
  await db.insert(templates).values(
    Object.values(TEMPLATES).map((t) => ({
      type: t.type,
      name: t.name,
      description: t.description,
      bodyJson: markdownToTiptap(t.markdownBody),
      bodyMd: t.markdownBody,
      promptHints: t.promptHints,
      isDefault: true,
    })),
  );

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
        horizon: 'now' as const,
        status: 'in_progress' as const,
        startDate: thisMonth(1),
        endDate: thisMonth(21),
        sortOrder: 0,
      },
      {
        productId: product.id,
        title: 'Now-next-later board',
        horizon: 'now' as const,
        status: 'in_progress' as const,
        startDate: thisMonth(8),
        endDate: thisMonth(28),
        sortOrder: 1,
      },
      // Next
      {
        productId: product.id,
        title: 'Gantt roadmap',
        horizon: 'next' as const,
        status: 'planned' as const,
        startDate: nextMonth(1),
        endDate: nextMonth(18),
        sortOrder: 0,
      },
      {
        productId: product.id,
        title: 'AI doc drafting',
        horizon: 'next' as const,
        status: 'planned' as const,
        startDate: nextMonth(10),
        endDate: nextMonth(28),
        sortOrder: 1,
      },
      // Later — two dated (so the landing hero shows ≥6 bars per AC2), two dateless
      // (→ unscheduled tray + attention).
      {
        productId: product.id,
        title: 'Comments & review',
        horizon: 'later' as const,
        status: 'idea' as const,
        startDate: nextMonth(20),
        endDate: nextMonth(38), // Date.UTC rolls over into the following month
        sortOrder: 0,
      },
      {
        productId: product.id,
        title: 'Up/down voting',
        horizon: 'later' as const,
        status: 'idea' as const,
        startDate: nextMonth(32),
        endDate: nextMonth(46),
        sortOrder: 1,
      },
      { productId: product.id, title: 'Realtime collaboration (Yjs)', horizon: 'later' as const, status: 'idea' as const, sortOrder: 2 },
      { productId: product.id, title: 'ECS deployment', horizon: 'later' as const, status: 'idea' as const, sortOrder: 3 },
    ])
    .returning();

  const byTitle = new Map(featureRows.map((f) => [f.title, f]));
  const editor = byTitle.get('Rich markdown editor')!;
  const gantt = byTitle.get('Gantt roadmap')!;

  const docRows = await db.insert(documents).values([
    {
      featureId: editor.id,
      type: 'prd' as const,
      title: 'Rich markdown editor — PRD',
      status: 'draft' as const,
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
      type: 'tech_spec' as const,
      title: 'Rich markdown editor — Tech spec',
      status: 'in_review' as const,
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
      type: 'feature_brief' as const,
      title: 'Gantt roadmap — Feature brief',
      status: 'final' as const,
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
  ]).returning();

  // Attribute everything in the seed to Corban.
  await db.update(features).set({ createdBy: corban.id, updatedBy: corban.id });
  await db.update(documents).set({ createdBy: corban.id, updatedBy: corban.id });

  // Corban collaborates on the two documented features.
  await db.insert(featureCollaborators).values([
    { featureId: editor.id, userId: corban.id },
    { featureId: gantt.id, userId: corban.id },
  ]);

  // --- 3-month synthetic history so the roadmap Time Machine has a story to replay ---
  // Every feature is born in Later as an idea; the story promotes, schedules, and
  // staffs them until replaying all events lands exactly on the rows seeded above.
  const board = byTitle.get('Now-next-later board')!;
  const ai = byTitle.get('AI doc drafting')!;
  const commentsFeature = byTitle.get('Comments & review')!;
  const voting = byTitle.get('Up/down voting')!;
  const realtime = byTitle.get('Realtime collaboration (Yjs)')!;
  const ecs = byTitle.get('ECS deployment')!;

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const created = (f: typeof editor, at: Date) => ({
    featureId: f.id,
    actorId: corban.id,
    kind: 'feature_created',
    payload: {
      to: f.title,
      snapshot: { title: f.title, horizon: 'later', status: 'idea', startDate: null, endDate: null },
    },
    createdAt: at,
  });

  await db.insert(activity).values([
    // ~12 weeks ago: the first ideas land.
    created(editor, daysAgo(85)),
    created(board, daysAgo(83)),
    // The editor gets serious: promoted, scheduled (roughly), then rescheduled.
    { featureId: editor.id, actorId: corban.id, kind: 'horizon_changed', payload: { from: 'later', to: 'next' }, createdAt: daysAgo(78) },
    created(gantt, daysAgo(74)),
    { featureId: editor.id, actorId: corban.id, kind: 'dates_changed', payload: { from: { startDate: null, endDate: null }, to: { startDate: thisMonth(5), endDate: thisMonth(25) } }, createdAt: daysAgo(70) },
    { featureId: editor.id, actorId: corban.id, kind: 'doc_created', payload: { to: 'Rich markdown editor — PRD' }, createdAt: daysAgo(62) },
    { featureId: editor.id, actorId: corban.id, kind: 'status_changed', payload: { from: 'idea', to: 'planned' }, createdAt: daysAgo(60) },
    { featureId: editor.id, actorId: corban.id, kind: 'horizon_changed', payload: { from: 'next', to: 'now' }, createdAt: daysAgo(58) },
    { featureId: board.id, actorId: corban.id, kind: 'horizon_changed', payload: { from: 'later', to: 'next' }, createdAt: daysAgo(55) },
    created(ai, daysAgo(50)),
    // Editor dates pulled earlier — a visible bar move in the Time Machine.
    { featureId: editor.id, actorId: corban.id, kind: 'dates_changed', payload: { from: { startDate: thisMonth(5), endDate: thisMonth(25) }, to: { startDate: editor.startDate, endDate: editor.endDate } }, createdAt: daysAgo(46) },
    created(commentsFeature, daysAgo(42)),
    { featureId: editor.id, actorId: corban.id, kind: 'status_changed', payload: { from: 'planned', to: 'in_progress' }, createdAt: daysAgo(40) },
    { featureId: gantt.id, actorId: corban.id, kind: 'horizon_changed', payload: { from: 'later', to: 'next' }, createdAt: daysAgo(36) },
    created(voting, daysAgo(33)),
    { featureId: board.id, actorId: corban.id, kind: 'status_changed', payload: { from: 'idea', to: 'planned' }, createdAt: daysAgo(30) },
    { featureId: gantt.id, actorId: corban.id, kind: 'dates_changed', payload: { from: { startDate: null, endDate: null }, to: { startDate: gantt.startDate, endDate: gantt.endDate } }, createdAt: daysAgo(28) },
    { featureId: board.id, actorId: corban.id, kind: 'horizon_changed', payload: { from: 'next', to: 'now' }, createdAt: daysAgo(24) },
    created(realtime, daysAgo(18)),
    { featureId: ai.id, actorId: corban.id, kind: 'horizon_changed', payload: { from: 'later', to: 'next' }, createdAt: daysAgo(15) },
    { featureId: board.id, actorId: corban.id, kind: 'dates_changed', payload: { from: { startDate: null, endDate: null }, to: { startDate: board.startDate, endDate: board.endDate } }, createdAt: daysAgo(14) },
    { featureId: board.id, actorId: corban.id, kind: 'status_changed', payload: { from: 'planned', to: 'in_progress' }, createdAt: daysAgo(12) },
    created(ecs, daysAgo(10)),
    { featureId: gantt.id, actorId: corban.id, kind: 'status_changed', payload: { from: 'idea', to: 'planned' }, createdAt: daysAgo(9) },
    { featureId: ai.id, actorId: corban.id, kind: 'dates_changed', payload: { from: { startDate: null, endDate: null }, to: { startDate: ai.startDate, endDate: ai.endDate } }, createdAt: daysAgo(8) },
    { featureId: gantt.id, actorId: corban.id, kind: 'doc_created', payload: { to: 'Gantt roadmap — Feature brief' }, createdAt: daysAgo(7) },
    { featureId: ai.id, actorId: corban.id, kind: 'status_changed', payload: { from: 'idea', to: 'planned' }, createdAt: daysAgo(6) },
    { featureId: commentsFeature.id, actorId: corban.id, kind: 'dates_changed', payload: { from: { startDate: null, endDate: null }, to: { startDate: commentsFeature.startDate, endDate: commentsFeature.endDate } }, createdAt: daysAgo(5) },
    { featureId: editor.id, actorId: corban.id, kind: 'doc_created', payload: { to: 'Rich markdown editor — Tech spec' }, createdAt: daysAgo(4) },
    { featureId: voting.id, actorId: corban.id, kind: 'dates_changed', payload: { from: { startDate: null, endDate: null }, to: { startDate: voting.startDate, endDate: voting.endDate } }, createdAt: daysAgo(3) },
  ]);

  // --- comments: two unresolved threads (PRD doc + Gantt feature), one resolved ---
  const prdDoc = docRows.find((d) => d.type === 'prd')!;
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

  const [prdRoot] = await db
    .insert(comments)
    .values({
      authorId: corban.id,
      documentId: prdDoc.id,
      body: 'Should the requirements call out keyboard shortcuts explicitly? Slash commands alone may not cover power users.',
      createdAt: minutesAgo(90),
      updatedAt: minutesAgo(90),
    })
    .returning();
  await db.insert(comments).values({
    authorId: corban.id,
    documentId: prdDoc.id,
    parentId: prdRoot.id,
    body: 'Good catch — adding a "Should" line for Cmd+B/Cmd+I and the link dialog.',
    createdAt: minutesAgo(75),
    updatedAt: minutesAgo(75),
  });

  const [ganttRoot] = await db
    .insert(comments)
    .values({
      authorId: corban.id,
      featureId: gantt.id,
      body: 'Do we want week or month granularity for the first cut of the timeline?',
      createdAt: minutesAgo(60),
      updatedAt: minutesAgo(60),
    })
    .returning();
  await db.insert(comments).values({
    authorId: corban.id,
    featureId: gantt.id,
    parentId: ganttRoot.id,
    body: 'Month view first — weeks can land with the zoom control.',
    createdAt: minutesAgo(45),
    updatedAt: minutesAgo(45),
  });

  await db.insert(comments).values({
    authorId: corban.id,
    featureId: editor.id,
    body: 'Confirmed: tables are in scope for the demo.',
    resolvedAt: minutesAgo(30),
    resolvedBy: corban.id,
    createdAt: minutesAgo(120),
    updatedAt: minutesAgo(120),
  });

  // --- votes: Rich markdown editor at +1 ---
  await db.insert(votes).values({ userId: corban.id, featureId: editor.id, value: 1 });

  console.log(
    `seeded: 1 product, ${featureRows.length} features, 3 documents, 4 templates, 1 user, 5 comments, 1 vote, 3-month activity history`,
  );
}

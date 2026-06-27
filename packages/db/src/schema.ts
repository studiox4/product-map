import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
  integer,
  smallint,
  jsonb,
  pgEnum,
  primaryKey,
  check,
  boolean,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const horizonEnum = pgEnum('horizon', ['now', 'next', 'later']);
export const featureStatusEnum = pgEnum('feature_status', ['idea', 'planned', 'in_progress', 'shipped']);
export const docTypeEnum = pgEnum('doc_type', ['prd', 'brd', 'tech_spec', 'feature_brief', 'idea_pitch', 'release_notes']);
export const docStatusEnum = pgEnum('doc_status', ['draft', 'in_review', 'final']);
export const ideaStatusEnum = pgEnum('idea_status', ['inbox', 'triaged', 'promoted', 'archived', 'pending']);
export const evidenceKindEnum = pgEnum('evidence_kind', ['quote', 'research', 'ticket', 'metric', 'other']);
export const releaseStatusEnum = pgEnum('release_status', ['planned', 'shipped']);
export const featureSizeEnum = pgEnum('feature_size', ['s', 'm', 'l']);
export const objectiveStatusEnum = pgEnum('objective_status', ['on_track', 'at_risk', 'achieved', 'dropped']);
export const planStatusEnum = pgEnum('plan_status', ['draft', 'applied', 'archived']);
export const userRoleEnum = pgEnum('user_role', ['admin', 'member']);
export const memberRoleEnum = pgEnum('member_role', ['owner', 'editor', 'viewer']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  role: userRoleEnum('role').notNull().default('member'),
  tokenVersion: integer('token_version').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  // NOT NULL + unique. The API always supplies a name-derived slug (uniqueSlug);
  // the gen_random_uuid default is a safety net so direct DB inserts (seeds,
  // tests) never violate NOT NULL. Added nullable in 0014, finalized in 0015.
  slug: text('slug').notNull().unique().default(sql`gen_random_uuid()::text`),
  vision: text('vision').notNull().default(''),
  aboutMd: text('about_md').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});
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
export const projectFavorites = pgTable(
  'project_favorites',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] })],
);
export const features = pgTable('features', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  horizon: horizonEnum('horizon').notNull().default('later'),
  status: featureStatusEnum('status').notNull().default('idea'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  sortOrder: integer('sort_order').notNull().default(0),
  descriptionMd: text('description_md').notNull().default(''),
  size: featureSizeEnum('size'),
  riskMd: text('risk_md').notNull().default(''),
  objectiveId: uuid('objective_id').references((): AnyPgColumn => objectives.id, { onDelete: 'set null' }),
  releaseId: uuid('release_id').references((): AnyPgColumn => releases.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (t) => [index('features_project_id_idx').on(t.projectId)]);
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id').references(() => features.id, { onDelete: 'cascade' }),
    ideaId: uuid('idea_id').references((): AnyPgColumn => ideas.id, { onDelete: 'cascade' }),
    type: docTypeEnum('type').notNull(),
    title: text('title').notNull(),
    contentJson: jsonb('content_json').notNull().default({ type: 'doc', content: [] }),
    contentMd: text('content_md').notNull().default(''),
    status: docStatusEnum('status').notNull().default('draft'),
    cover: text('cover'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Ownership integrity: release_notes docs are owned via releases.notes_doc_id
    // (both columns NULL); every other doc belongs to a feature and/or an idea
    // (a promoted idea's pitch carries BOTH — feature_id is set on promote and
    // idea_id stays for provenance). The ::text cast keeps the new enum label
    // usable inside the same migration transaction that adds it (PG 55P04).
    check(
      'documents_owner_check',
      sql`CASE WHEN ${t.type}::text = 'release_notes' THEN ${t.featureId} IS NULL AND ${t.ideaId} IS NULL ELSE ${t.featureId} IS NOT NULL OR ${t.ideaId} IS NOT NULL END`,
    ),
    index('documents_project_id_idx').on(t.projectId),
  ],
);
export const featureCollaborators = pgTable(
  'feature_collaborators',
  {
    featureId: uuid('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.featureId, t.userId] })],
);
export const activity = pgTable('activity', {
  id: uuid('id').defaultRandom().primaryKey(),
  featureId: uuid('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
  // Denormalized scope key for the cross-project dashboard feed. Added nullable
  // in 0014 (backfilled from features.project_id), flipped NOT NULL in 0015 once
  // every recordActivity caller writes it.
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('activity_project_id_idx').on(t.projectId)]);
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id').references(() => features.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Exactly one of feature_id / document_id is set.
    check('comments_target_check', sql`(${t.featureId} IS NULL) <> (${t.documentId} IS NULL)`),
    check('comments_body_check', sql`char_length(${t.body}) BETWEEN 1 AND 4000`),
  ],
);
const NOTIFICATION_KIND_VALUES = ['mention', 'comment', 'reply', 'project_invite', 'idea_submitted'] as const;
const kindCheckList = NOTIFICATION_KIND_VALUES.map((v) => `'${v}'`).join(', ');

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().$type<(typeof NOTIFICATION_KIND_VALUES)[number]>(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    featureId: uuid('feature_id').references(() => features.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    payload: jsonb('payload'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('notifications_kind_check', sql`${t.kind} IN (${sql.raw(kindCheckList)})`),
    index('notifications_user_unread_idx').on(t.userId, t.readAt),
    index('notifications_user_created_idx').on(t.userId, t.createdAt.desc(), t.id),
  ],
);

export const notificationMutes = pgTable(
  'notification_mutes',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().$type<(typeof NOTIFICATION_KIND_VALUES)[number]>(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kind] }),
    check('notification_mutes_kind_check', sql`${t.kind} IN (${sql.raw(kindCheckList)})`),
  ],
);

export const votes = pgTable(
  'votes',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
    value: smallint('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.featureId] }),
    check('votes_value_check', sql`${t.value} IN (1, -1)`),
  ],
);
export const templates = pgTable(
  'templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: docTypeEnum('type').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    bodyJson: jsonb('body_json').notNull(),
    bodyMd: text('body_md').notNull(),
    promptHints: text('prompt_hints').notNull().default(''),
    isDefault: boolean('is_default').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Exactly one default per doc type.
    uniqueIndex('templates_default_per_type').on(t.type).where(sql`${t.isDefault}`),
  ],
);
export const ideas = pgTable('ideas', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  bodyMd: text('body_md').notNull().default(''),
  source: text('source').notNull().default(''), // "sales call", "support", freeform
  submitterName: text('submitter_name'),
  submitterEmail: text('submitter_email'),
  status: ideaStatusEnum('status').notNull().default('inbox'),
  promotedFeatureId: uuid('promoted_feature_id').references(() => features.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('ideas_project_id_idx').on(t.projectId)]);
export const ideaVotes = pgTable(
  'idea_votes',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    ideaId: uuid('idea_id').notNull().references(() => ideas.id, { onDelete: 'cascade' }),
    value: smallint('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.ideaId] }),
    check('idea_votes_value_check', sql`${t.value} IN (1, -1)`),
  ],
);
export const evidence = pgTable('evidence', {
  id: uuid('id').defaultRandom().primaryKey(),
  featureId: uuid('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
  kind: evidenceKindEnum('kind').notNull(),
  title: text('title').notNull(),
  bodyMd: text('body_md').notNull().default(''),
  sourceUrl: text('source_url').notNull().default(''),
  weight: integer('weight').notNull().default(1), // e.g. ticket count
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const decisions = pgTable('decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  featureId: uuid('feature_id').references(() => features.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  decisionMd: text('decision_md').notNull(),
  alternativesMd: text('alternatives_md').notNull().default(''),
  sourceCommentId: uuid('source_comment_id').references(() => comments.id, { onDelete: 'set null' }),
  decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('decisions_project_id_idx').on(t.projectId)]);
export const featureDependencies = pgTable(
  'feature_dependencies',
  {
    blockerId: uuid('blocker_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    check('feature_dependencies_self_check', sql`${t.blockerId} <> ${t.blockedId}`),
  ],
);
export const releases = pgTable('releases', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  targetDate: date('target_date'),
  status: releaseStatusEnum('status').notNull().default('planned'),
  notesDocId: uuid('notes_doc_id').references(() => documents.id, { onDelete: 'set null' }),
  shippedAt: timestamp('shipped_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('releases_project_id_idx').on(t.projectId)]);
export const objectives = pgTable('objectives', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  descriptionMd: text('description_md').notNull().default(''),
  metric: text('metric').notNull().default(''),
  target: text('target').notNull().default(''),
  current: text('current').notNull().default(''),
  status: objectiveStatusEnum('status').notNull().default('on_track'),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  quarter: text('quarter').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('objectives_project_id_idx').on(t.projectId)]);
export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: planStatusEnum('status').notNull().default('draft'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('plans_project_id_idx').on(t.projectId)]);
export const planEntries = pgTable(
  'plan_entries',
  {
    planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
    startDate: date('start_date'),
    endDate: date('end_date'),
    horizon: horizonEnum('horizon').notNull(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.featureId] })],
);
export const shareTokens = pgTable('share_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  kind: text('kind').notNull().default('roadmap'),
  // Which sections the public page exposes. Default = the legacy all-on share.
  sections: jsonb('sections')
    .$type<{ roadmap: boolean; board: boolean; changelog: boolean }>()
    .notNull()
    .default({ roadmap: true, board: true, changelog: true }),
  // Optional time-bound expiry. Null = never expires (legacy behaviour).
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  // Intake-token config (E5). Null for roadmap tokens. Read paths key off `kind`.
  config: jsonb('config').$type<{ introMd: string; moderation: boolean }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [index('share_tokens_project_id_idx').on(t.projectId)]);
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
export const uploads = pgTable('uploads', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  path: text('path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const horizonEnum = pgEnum('horizon', ['now', 'next', 'later']);
export const featureStatusEnum = pgEnum('feature_status', ['idea', 'planned', 'in_progress', 'shipped']);
export const docTypeEnum = pgEnum('doc_type', ['prd', 'brd', 'tech_spec', 'feature_brief']);
export const docStatusEnum = pgEnum('doc_status', ['draft', 'in_review', 'final']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  vision: text('vision').notNull().default(''),
  aboutMd: text('about_md').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const features = pgTable('features', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  horizon: horizonEnum('horizon').notNull().default('later'),
  status: featureStatusEnum('status').notNull().default('idea'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  sortOrder: integer('sort_order').notNull().default(0),
  descriptionMd: text('description_md').notNull().default(''),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  featureId: uuid('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
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
});
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
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
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
export const uploads = pgTable('uploads', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  path: text('path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

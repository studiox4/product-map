import { setupTestDb, truncateAll, closeTestDb, createTestProject, createTestUser, TEST_DATABASE_URL } from '../test/helpers';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDb, ideas, features, documents, comments } from '@productmap/db';
import { loadScoped, loadScopedComment, ScopeError } from './scope';

const db = createDb(TEST_DATABASE_URL).db;
beforeAll(setupTestDb); afterAll(closeTestDb); beforeEach(truncateAll);

describe('loadScoped', () => {
  it('returns the row when it belongs to the project', async () => {
    const p = await createTestProject();
    const [idea] = await db.insert(ideas).values({ title: 'x', projectId: p.id }).returning();
    const row = await loadScoped(ideas, idea.id, p.id);
    expect(row.id).toBe(idea.id);
  });

  it('throws ScopeError(404) when the row belongs to another project', async () => {
    const a = await createTestProject('A');
    const b = await createTestProject('B');
    const [ideaB] = await db.insert(ideas).values({ title: 'b', projectId: b.id }).returning();
    await expect(loadScoped(ideas, ideaB.id, a.id)).rejects.toMatchObject({ status: 404 });
  });

  it('throws ScopeError(404) when the row does not exist', async () => {
    const a = await createTestProject('A');
    await expect(loadScoped(ideas, '00000000-0000-0000-0000-000000000000', a.id)).rejects.toMatchObject({ status: 404 });
  });

  it('ScopeError is an instance of Error with status 404', () => {
    const e = new ScopeError();
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(404);
  });
});

describe('loadScopedComment', () => {
  it('returns the comment when it belongs to the given project (via feature)', async () => {
    const user = await createTestUser();
    const p = await createTestProject('CommentA');
    const [feature] = await db.insert(features).values({ title: 'F1', projectId: p.id }).returning();
    const [comment] = await db
      .insert(comments)
      .values({ body: 'hello', featureId: feature.id, authorId: user.id })
      .returning();
    const row = await loadScopedComment(comment.id, p.id);
    expect(row.id).toBe(comment.id);
  });

  it('throws ScopeError(404) when the comment is on a feature in another project', async () => {
    const user = await createTestUser();
    const a = await createTestProject('CommentB-A');
    const b = await createTestProject('CommentB-B');
    const [featureB] = await db.insert(features).values({ title: 'FB', projectId: b.id }).returning();
    const [comment] = await db
      .insert(comments)
      .values({ body: 'cross', featureId: featureB.id, authorId: user.id })
      .returning();
    // comment belongs to project B — scoping to project A must reject
    await expect(loadScopedComment(comment.id, a.id)).rejects.toMatchObject({ status: 404 });
  });

  it('throws ScopeError(404) when the comment does not exist', async () => {
    const p = await createTestProject('CommentC');
    await expect(
      loadScopedComment('00000000-0000-0000-0000-000000000000', p.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns the comment when it belongs to the given project (via document)', async () => {
    const user = await createTestUser();
    const p = await createTestProject('CommentD');
    const [feature] = await db.insert(features).values({ title: 'FD', projectId: p.id }).returning();
    const [doc] = await db
      .insert(documents)
      .values({ title: 'Doc1', projectId: p.id, type: 'prd', featureId: feature.id })
      .returning();
    const [comment] = await db
      .insert(comments)
      .values({ body: 'doc comment', documentId: doc.id, authorId: user.id })
      .returning();
    const row = await loadScopedComment(comment.id, p.id);
    expect(row.id).toBe(comment.id);
  });

  it('throws ScopeError(404) when the comment is on a document in another project', async () => {
    const user = await createTestUser();
    const a = await createTestProject('CommentE-A');
    const b = await createTestProject('CommentE-B');
    const [featureB] = await db.insert(features).values({ title: 'FEB', projectId: b.id }).returning();
    const [docB] = await db
      .insert(documents)
      .values({ title: 'DocB', projectId: b.id, type: 'prd', featureId: featureB.id })
      .returning();
    const [comment] = await db
      .insert(comments)
      .values({ body: 'cross doc', documentId: docB.id, authorId: user.id })
      .returning();
    // comment belongs to project B — scoping to project A must reject
    await expect(loadScopedComment(comment.id, a.id)).rejects.toMatchObject({ status: 404 });
  });
});

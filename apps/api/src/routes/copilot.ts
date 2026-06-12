// Copilot: AI doc review (rubric SSE), workspace-grounded chat (Postgres
// full-text retrieval — no embeddings) and derived hygiene nudges. Mounted at
// /api, so paths here are /ai/review-doc, /ai/chat and /copilot/nudges.
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, isNotNull, isNull, lt, notExists, or, sql } from 'drizzle-orm';
import { streamText } from 'ai';
import { reviewDocBody, copilotChatBody } from '@productmap/shared';
import type { CopilotNudge } from '@productmap/shared';
import { db } from '../db';
import { comments, documents, features } from '@productmap/db';
import { createAiModel } from '../lib/ai';

const REVIEW_SYSTEM_PROMPT =
  'You are a rigorous, kind product-document reviewer. Review the document against this rubric, ' +
  'one markdown section (## heading) per dimension, in this order: ' +
  'Problem clarity, Measurable metrics, Testable requirements, Non-goals, Risks. ' +
  'Under each heading give concrete, actionable feedback and cite specific doc lines by their ' +
  'line numbers (e.g. "L12"). Close with a one-line overall verdict. ' +
  'No preamble — output starts with the first ## heading.';

const CHAT_SYSTEM_PROMPT =
  'You are the ProductMap workspace copilot. Answer the question using ONLY the workspace ' +
  'context below. When you draw on a document, cite it by its exact title in bold ' +
  '(e.g. **Telemetry PRD**). If the context does not cover the question, say so plainly. ' +
  'Answer in concise markdown.';

/** Truncate a doc body for prompt context; whole docs can be very long. */
const DOC_CONTEXT_CHARS = 4000;

const STALE_DRAFT_DAYS = 14;
const STALE_THREAD_DAYS = 7;

export const copilotRoutes = new Hono()
  // POST /api/ai/review-doc {documentId} → SSE markdown rubric review.
  .post('/ai/review-doc', zValidator('json', reviewDocBody), async (c) => {
    const model = createAiModel();
    if (!model) return c.json({ error: 'ai_disabled' }, 503);

    const { documentId } = c.req.valid('json');
    const [doc] = await db
      .select({
        id: documents.id,
        type: documents.type,
        title: documents.title,
        contentMd: documents.contentMd,
        featureTitle: features.title,
      })
      .from(documents)
      .innerJoin(features, eq(documents.featureId, features.id))
      .where(eq(documents.id, documentId));
    if (!doc) return c.json({ error: 'not_found' }, 404);

    const numbered = doc.contentMd
      .split('\n')
      .map((line, i) => `${i + 1}: ${line}`)
      .join('\n');
    const prompt = [
      `Document under review: "${doc.title}" (${doc.type}) for feature "${doc.featureTitle}".`,
      '',
      'Document content (line-numbered):',
      '',
      numbered,
    ].join('\n');

    return streamSSE(c, async (stream) => {
      try {
        const result = streamText({ model, system: REVIEW_SYSTEM_PROMPT, prompt });
        for await (const text of result.textStream) {
          if (text) await stream.writeSSE({ event: 'chunk', data: JSON.stringify({ text }) });
        }
        await stream.writeSSE({ event: 'done', data: '{}' });
      } catch (err) {
        console.error('copilot review-doc stream error', err);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: 'generation_failed' }),
        });
      }
    });
  })
  // POST /api/ai/chat {question} → SSE answer grounded in the top-8 docs by
  // Postgres full-text rank over content_md plus a feature summary.
  .post('/ai/chat', zValidator('json', copilotChatBody), async (c) => {
    const model = createAiModel();
    if (!model) return c.json({ error: 'ai_disabled' }, 503);

    const { question } = c.req.valid('json');

    const tsQuery = sql`plainto_tsquery('english', ${question})`;
    const tsVector = sql`to_tsvector('english', ${documents.contentMd})`;
    const matchedDocs = await db
      .select({
        title: documents.title,
        contentMd: documents.contentMd,
        rank: sql<number>`ts_rank(${tsVector}, ${tsQuery})`,
      })
      .from(documents)
      .where(sql`${tsVector} @@ ${tsQuery}`)
      .orderBy(sql`ts_rank(${tsVector}, ${tsQuery}) desc`)
      .limit(8);

    const featureRows = await db
      .select({ title: features.title, horizon: features.horizon, status: features.status })
      .from(features)
      .orderBy(asc(features.createdAt));

    const docBlocks =
      matchedDocs.length === 0
        ? ['(no documents matched the question)']
        : matchedDocs.map(
            (d) => `### ${d.title}\n\n${d.contentMd.slice(0, DOC_CONTEXT_CHARS)}`,
          );
    const featureLines =
      featureRows.length === 0
        ? ['(no features yet)']
        : featureRows.map((f) => `- ${f.title} — horizon: ${f.horizon}, status: ${f.status}`);

    const system = [
      CHAT_SYSTEM_PROMPT,
      '',
      'Workspace documents (most relevant first — cite these titles):',
      '',
      ...docBlocks,
      '',
      'Roadmap features:',
      ...featureLines,
    ].join('\n');

    return streamSSE(c, async (stream) => {
      try {
        const result = streamText({ model, system, prompt: question });
        for await (const text of result.textStream) {
          if (text) await stream.writeSSE({ event: 'chunk', data: JSON.stringify({ text }) });
        }
        await stream.writeSSE({ event: 'done', data: '{}' });
      } catch (err) {
        console.error('copilot chat stream error', err);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: 'generation_failed' }),
        });
      }
    });
  })
  // GET /api/copilot/nudges → derived hygiene prompts (no table behind them,
  // no AI involved — available even when AI is disabled).
  .get('/copilot/nudges', async (c) => {
    const staleDraftCutoff = new Date(Date.now() - STALE_DRAFT_DAYS * 24 * 60 * 60 * 1000);
    const staleThreadCutoff = new Date(Date.now() - STALE_THREAD_DAYS * 24 * 60 * 60 * 1000);

    // 1) Drafts untouched for >14 days.
    const staleDrafts = await db
      .select({
        documentId: documents.id,
        // Feature-owned docs only: idea pitches / release notes have no feature page to nudge into.
        featureId: sql<string>`${documents.featureId}`,
        title: documents.title,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(and(eq(documents.status, 'draft'), lt(documents.updatedAt, staleDraftCutoff), isNotNull(documents.featureId)))
      .orderBy(asc(documents.updatedAt));

    // 2) Now-horizon features missing a start or end date.
    const datelessNow = await db
      .select({ featureId: features.id, title: features.title })
      .from(features)
      .where(
        and(
          eq(features.horizon, 'now'),
          or(isNull(features.startDate), isNull(features.endDate)),
        ),
      )
      .orderBy(asc(features.sortOrder), asc(features.createdAt));

    // 3) Oversized: L-size features in Now with no docs at all.
    const oversized = await db
      .select({ featureId: features.id, title: features.title })
      .from(features)
      .where(
        and(
          eq(features.size, 'l'),
          eq(features.horizon, 'now'),
          notExists(
            db.select({ one: sql`1` }).from(documents).where(eq(documents.featureId, features.id)),
          ),
        ),
      )
      .orderBy(asc(features.sortOrder), asc(features.createdAt));

    // 4) Unresolved root comment threads older than 7 days.
    const staleThreads = await db
      .select({
        commentId: comments.id,
        featureId: comments.featureId,
        documentId: comments.documentId,
        title: sql<string>`coalesce(${features.title}, ${documents.title}, '')`,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .leftJoin(features, eq(comments.featureId, features.id))
      .leftJoin(documents, eq(comments.documentId, documents.id))
      .where(
        and(
          isNull(comments.parentId),
          isNull(comments.resolvedAt),
          lt(comments.createdAt, staleThreadCutoff),
        ),
      )
      .orderBy(asc(comments.createdAt));

    const nudges: CopilotNudge[] = [
      ...staleDrafts.map(
        (d): CopilotNudge => ({
          kind: 'stale_draft',
          documentId: d.documentId,
          featureId: d.featureId,
          title: d.title,
          updatedAt: d.updatedAt.toISOString(),
        }),
      ),
      ...datelessNow.map(
        (f): CopilotNudge => ({ kind: 'dateless_now', featureId: f.featureId, title: f.title }),
      ),
      ...oversized.map(
        (f): CopilotNudge => ({ kind: 'oversized', featureId: f.featureId, title: f.title }),
      ),
      ...staleThreads.map(
        (t): CopilotNudge => ({
          kind: 'stale_thread',
          commentId: t.commentId,
          featureId: t.featureId,
          documentId: t.documentId,
          title: t.title,
          createdAt: t.createdAt.toISOString(),
        }),
      ),
    ];
    return c.json(nudges);
  });

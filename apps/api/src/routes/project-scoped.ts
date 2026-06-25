import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { projects } from '@productmap/db/schema';
import { db } from '../db';
import { requireMembership, type MembershipEnv } from '../middleware/membership';
import { objectivesRoutes } from './objectives';
import { releasesRoutes } from './releases';
import { plansRoutes } from './plans';
import { featuresRoutes } from './features';
import { depsRoutes } from './deps';
import { evidenceRoutes } from './evidence';
import { documentsRoutes, exportRoutes } from './documents';
import { commentsRoutes } from './comments';
import { activityRoutes } from './activity';
import { overviewRoutes } from './overview';
import { ideasRoutes } from './ideas';
import { decisionsRoutes } from './decisions';
import { copilotRoutes } from './copilot';
import { shareMintRoutes } from './share';

/**
 * Content routes scoped to /api/projects/:projectId. One method-based gate:
 * GET → viewer, any mutation → editor. requireMembership 404s non-members and
 * sets currentProjectId. All content mounts live here (single owner).
 */
export const projectScopedContent = new Hono<MembershipEnv>()
  .use('*', async (c, next) => {
    const min = ['GET', 'HEAD'].includes(c.req.method) ? 'viewer' : 'editor';
    return requireMembership(min)(c as never, next);
  })
  .use('*', async (c, next) => {
    if (!['GET', 'HEAD'].includes(c.req.method)) {
      const pid = c.get('currentProjectId');
      const [p] = await db.select({ archivedAt: projects.archivedAt }).from(projects).where(eq(projects.id, pid));
      if (p?.archivedAt) return c.json({ error: 'project_archived' }, 409);
    }
    return next();
  })
  .route('/objectives', objectivesRoutes)
  .route('/releases', releasesRoutes)
  .route('/plans', plansRoutes)
  .route('/features', featuresRoutes)
  .route('/features', depsRoutes)
  // evidence defines /features/:id/evidence + /evidence/:id — mount at root
  .route('/', evidenceRoutes)
  .route('/documents', documentsRoutes)
  // exportRoutes defines /export.zip — mount at root
  .route('/', exportRoutes)
  .route('/comments', commentsRoutes)
  .route('/activity', activityRoutes)
  .route('/overview', overviewRoutes)
  .route('/ideas', ideasRoutes)
  // decisionsRoutes defines /decisions… + /ai/suggest-decision — mount at root
  .route('/', decisionsRoutes)
  // copilotRoutes defines /ai/review-doc, /ai/chat, /copilot/nudges — mount at root.
  // NOTE: aiRoutes (/api/ai/status) is GLOBAL config and stays flat in app.ts.
  // review-doc/chat are POST → editor-gated by the method gate; nudges is GET →
  // viewer-allowed. Viewers get nudges (read) but not AI mutations — deliberate v1 choice.
  .route('/', copilotRoutes)
  // shareMintRoutes: POST /share/roadmap — editor-gated by the method gate above.
  .route('/share', shareMintRoutes);

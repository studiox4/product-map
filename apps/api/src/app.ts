import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { activityRoutes } from './routes/activity';
import { featuresRoutes } from './routes/features';
import { productsRoutes } from './routes/products';
import { documentsRoutes, exportRoutes } from './routes/documents';
import { uploadsRoutes } from './routes/uploads';
import { overviewRoutes } from './routes/overview';
import { aiRoutes } from './routes/ai';
import { usersRoutes } from './routes/users';
import { commentsRoutes } from './routes/comments';
import { templatesRoutes } from './routes/templates';
import { adminRoutes } from './routes/admin';
// Dream-tier route modules (mounted as stubs by the foundation agent; each
// feature agent fills in its own file — nobody else edits app.ts).
import { ideasRoutes } from './routes/ideas';
import { evidenceRoutes } from './routes/evidence';
import { decisionsRoutes } from './routes/decisions';
import { depsRoutes } from './routes/deps';
import { releasesRoutes } from './routes/releases';
import { objectivesRoutes } from './routes/objectives';
import { shareRoutes } from './routes/share';
import { copilotRoutes } from './routes/copilot';

export const app = new Hono()
  .get('/api/healthz', (c) => c.json({ ok: true }))
  .route('/api/users', usersRoutes)
  .route('/api/features', featuresRoutes)
  .route('/api/activity', activityRoutes)
  .route('/api/comments', commentsRoutes)
  .route('/api/products', productsRoutes)
  .route('/api/documents', documentsRoutes)
  .route('/api', exportRoutes)
  .route('/api/uploads', uploadsRoutes)
  .route('/api/overview', overviewRoutes)
  .route('/api/ai', aiRoutes)
  .route('/api/templates', templatesRoutes)
  .route('/api/admin', adminRoutes)
  // --- Dream tier mounts (paths inside each module are relative to these) ---
  .route('/api/ideas', ideasRoutes)
  // evidence defines /features/:id/evidence + /evidence/:id
  .route('/api', evidenceRoutes)
  // decisions defines /decisions… + /ai/suggest-decision
  .route('/api', decisionsRoutes)
  // deps defines /:id/dependencies
  .route('/api/features', depsRoutes)
  .route('/api/releases', releasesRoutes)
  .route('/api/objectives', objectivesRoutes)
  .route('/api/share', shareRoutes)
  // copilot defines /ai/review-doc, /ai/chat, /copilot/nudges
  .route('/api', copilotRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  const requestId = crypto.randomUUID();
  console.error(`[${requestId}]`, err);
  return c.json({ error: 'internal', requestId }, 500);
});

export type AppType = typeof app;

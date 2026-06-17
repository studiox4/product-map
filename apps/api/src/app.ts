import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authRoutes } from './routes/auth';
import { requireAuth, requireAdmin } from './middleware/auth';
import { isSameOrigin } from './lib/rate-limit';
import { activityRoutes } from './routes/activity';
import { projectsRoutes } from './routes/projects';
import { documentsRoutes, exportRoutes } from './routes/documents';
import { uploadsRoutes } from './routes/uploads';
import { overviewRoutes } from './routes/overview';
import { aiRoutes } from './routes/ai';
import { usersRoutes } from './routes/users';
import { templatesRoutes } from './routes/templates';
import { adminRoutes } from './routes/admin';
// Dream-tier route modules (mounted as stubs by the foundation agent; each
// feature agent fills in its own file — nobody else edits app.ts).
import { ideasRoutes } from './routes/ideas';
import { decisionsRoutes } from './routes/decisions';
import { shareRoutes } from './routes/share';
import { copilotRoutes } from './routes/copilot';
import { projectScopedContent } from './routes/project-scoped';

export const app = new Hono()
  .get('/api/healthz', (c) => c.json({ ok: true }))
  .route('/api/auth', authRoutes)
  // Global gate: CSRF origin check on mutations + auth on everything except the
  // public allowlist. (/api/auth/* runs its own origin+rate guard, so it's
  // allowlisted here.) SameSite=Lax cookies are the baseline CSRF defense; this
  // origin check is defense-in-depth and satisfies the spec for all routes.
  .use('/api/*', async (c, next) => {
    const p = c.req.path;
    const isAuthPath = p.startsWith('/api/auth/');
    const isPublic =
      isAuthPath ||
      p === '/api/healthz' ||
      (p.startsWith('/api/share/') && c.req.method === 'GET');
    if (c.req.method !== 'GET' && !isPublic && !isSameOrigin(c)) {
      return c.json({ error: 'forbidden_origin' }, 403);
    }
    if (isPublic) return next();
    return requireAuth(c as never, next);
  })
  .use('/api/admin/*', requireAdmin)
  .route('/api/users', usersRoutes)
  .route('/api/activity', activityRoutes)
  .route('/api/projects', projectsRoutes)
  // Content sub-app: registered AFTER mgmt so projectsRoutes /:projectId* get
  // first crack. A non-match falls through to this mount (Hono chain semantics).
  .route('/api/projects/:projectId', projectScopedContent)
  // documentsRoutes + exportRoutes → moved to /api/projects/:projectId/* in project-scoped.ts
  .route('/api/uploads', uploadsRoutes)
  .route('/api/overview', overviewRoutes)
  .route('/api/ai', aiRoutes)
  .route('/api/templates', templatesRoutes)
  .route('/api/admin', adminRoutes)
  // --- Dream tier mounts (paths inside each module are relative to these) ---
  .route('/api/ideas', ideasRoutes)
  // decisions defines /decisions… + /ai/suggest-decision
  .route('/api', decisionsRoutes)
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

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authRoutes } from './routes/auth';
import { requireAuth, requireAdmin } from './middleware/auth';
import { isSameOrigin } from './lib/rate-limit';
import { projectsRoutes } from './routes/projects';
import { dashboardRoutes } from './routes/dashboard';
import { uploadsRoutes } from './routes/uploads';
import { aiRoutes } from './routes/ai';
import { usersRoutes } from './routes/users';
import { templatesRoutes } from './routes/templates';
import { adminRoutes } from './routes/admin';
// Dream-tier route modules (mounted as stubs by the foundation agent; each
// feature agent fills in its own file — nobody else edits app.ts).
import { publicShareRoutes } from './routes/share';
import { projectScopedContent } from './routes/project-scoped';
import { invitesRoutes } from './routes/invites';

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
  .route('/api/dashboard', dashboardRoutes)
  .route('/api/projects', projectsRoutes)
  .route('/api/invites', invitesRoutes)
  // Content sub-app: registered AFTER mgmt so projectsRoutes /:projectId* get
  // first crack. A non-match falls through to this mount (Hono chain semantics).
  .route('/api/projects/:projectId', projectScopedContent)
  // documentsRoutes + exportRoutes → moved to /api/projects/:projectId/* in project-scoped.ts
  .route('/api/uploads', uploadsRoutes)
  .route('/api/ai', aiRoutes)
  .route('/api/templates', templatesRoutes)
  .route('/api/admin', adminRoutes)
  // --- Dream tier mounts (paths inside each module are relative to these) ---
  // decisions migrated to /api/projects/:projectId/ (project-scoped.ts)
  // copilotRoutes migrated to /api/projects/:projectId/ (project-scoped.ts)
  // publicShareRoutes: GET /:token/data is public (allowlist: GET /api/share/*);
  // DELETE /:token is NOT in the public allowlist — requireAuth runs for it via the
  // /api/* middleware, then the handler enforces membership on tokenRow.projectId.
  .route('/api/share', publicShareRoutes);

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

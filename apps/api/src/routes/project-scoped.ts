import { Hono } from 'hono';
import { requireMembership, type MembershipEnv } from '../middleware/membership';
import { objectivesRoutes } from './objectives';
import { releasesRoutes } from './releases';
import { plansRoutes } from './plans';
import { featuresRoutes } from './features';
import { depsRoutes } from './deps';

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
  .route('/objectives', objectivesRoutes)
  .route('/releases', releasesRoutes)
  .route('/plans', plansRoutes)
  .route('/features', featuresRoutes)
  .route('/features', depsRoutes);

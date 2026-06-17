import { Hono } from 'hono';
import { requireMembership, type MembershipEnv } from '../middleware/membership';

/**
 * Content routes scoped to /api/projects/:projectId. One method-based gate:
 * GET → viewer, any mutation → editor. requireMembership 404s non-members and
 * sets currentProjectId. Groups are mounted onto this app as they migrate.
 *
 * The __probe routes below are spike scaffolding — removed once objectives
 * lands in A5 and the probe is replaced by a real group.
 */
export const projectScopedContent = new Hono<MembershipEnv>()
  .use('*', async (c, next) => {
    const min = c.req.method === 'GET' ? 'viewer' : 'editor';
    return requireMembership(min)(c as never, next);
  })
  .get('/__probe', (c) => c.json({ pid: c.get('currentProjectId') }))
  .post('/__probe', (c) => c.json({ ok: true }));

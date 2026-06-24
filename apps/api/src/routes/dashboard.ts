import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';
import type { DashboardResponse } from '@productmap/shared';

// GET /api/dashboard — user-scoped, cross-project home. Behind the global
// /api/* requireAuth gate (registered in app.ts), so c.get('currentUser') is set.
// Skeleton: returns an empty payload. The aggregator is implemented in Task 3.
export const dashboardRoutes = new Hono<AuthEnv>().get('/', async (c) => {
  const empty: DashboardResponse = { projects: [], nextActions: [], myWork: [], activity: [] };
  return c.json(empty);
});

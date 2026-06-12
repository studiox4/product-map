// Mounted at /api/plans (app.ts). Foundation stub: GET list is real; the
// scenario endpoints (POST /, PATCH/DELETE /:id, PUT /:id/entries/:featureId,
// POST /:id/apply) are owned by the plans agent — see the dream-tier-2 spec.
import { Hono } from 'hono';
import { asc } from 'drizzle-orm';
import { plans } from '@productmap/db';
import { db } from '../db';
import { currentUser, type CurrentUserEnv } from '../middleware/current-user';

export const plansRoutes = new Hono<CurrentUserEnv>()
  .use('*', currentUser)
  .get('/', async (c) => {
    const rows = await db.select().from(plans).orderBy(asc(plans.createdAt));
    return c.json(rows);
  });

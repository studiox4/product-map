// Dream-tier route stub (foundation-owned mount point). The releases feature
// agent owns this file's handlers; app.ts already mounts it so no one else
// needs to touch app.ts.
import { Hono } from 'hono';

export const releasesRoutes = new Hono();

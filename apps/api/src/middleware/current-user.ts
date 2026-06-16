import type { users } from '@productmap/db';

export type UserRow = typeof users.$inferSelect;

/**
 * Hono env for authenticated routes. `currentUser` is guaranteed non-null
 * because routes run behind requireAuth (see middleware/auth.ts).
 */
export type CurrentUserEnv = { Variables: { currentUser: UserRow } };

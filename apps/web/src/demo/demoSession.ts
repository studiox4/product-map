// Mints the demo auth token. The real `requireAuth` verifies the access JWT
// (signature + expiry only, no DB read) and accepts it via the Authorization
// Bearer fallback; the real `requireMembership` grants admin → owner with no DB
// read. So a JWT with sub = the seeded admin user id and role 'admin' is accepted
// everywhere with zero auth-related DB reads.
import { sign } from 'hono/jwt';
import { config } from '../../../../apps/api/src/config';

// The stable seeded admin user id (see packages/db/src/seed-data.ts). The demo
// JWT's `sub` must match this so authored writes (comments, features) resolve the
// FK to a real user row.
export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

const ONE_YEAR_SEC = 365 * 24 * 60 * 60;

/**
 * Sign a long-lived demo access token with `config.authSecret` (in the browser a
 * fixed constant, so every config module instance signs/verifies with the same
 * secret). Returned raw, to be attached as `Authorization: Bearer <token>`.
 */
export async function mintDemoToken(): Promise<string> {
  return sign(
    {
      sub: DEMO_USER_ID,
      role: 'admin',
      tv: 0,
      exp: Math.floor(Date.now() / 1000) + ONE_YEAR_SEC,
    },
    config.authSecret,
  );
}

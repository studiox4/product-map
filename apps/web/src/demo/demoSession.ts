// Mints the demo auth cookie. The real `requireAuth` verifies a `pm_session` JWT
// (signature + expiry only, no DB read); the real `requireMembership` grants
// admin → owner with no DB read. So a JWT with sub = the seeded admin user id
// and role 'admin' is accepted everywhere with zero auth-related DB reads.
import { sign } from 'hono/jwt';
import { config } from '../../../../apps/api/src/config';
import { ACCESS_COOKIE } from '../../../../apps/api/src/lib/auth/cookies';

// The stable seeded admin user id (see packages/db/src/seed-data.ts). The demo
// JWT's `sub` must match this so authored writes (comments, features) resolve the
// FK to a real user row.
export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

const ONE_YEAR_SEC = 365 * 24 * 60 * 60;

/**
 * Sign a long-lived demo access token with the SAME ephemeral `config.authSecret`
 * the in-page app verifies against (one module instance signs and verifies), and
 * return it as a ready-to-attach `pm_session=<token>` cookie string.
 */
export async function mintDemoCookie(): Promise<string> {
  const token = await sign(
    {
      sub: DEMO_USER_ID,
      role: 'admin',
      tv: 0,
      exp: Math.floor(Date.now() / 1000) + ONE_YEAR_SEC,
    },
    config.authSecret,
  );
  return `${ACCESS_COOKIE}=${token}`;
}

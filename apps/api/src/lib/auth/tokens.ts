import { sign, verify } from 'hono/jwt';
import { config } from '../../config';

export interface AccessClaims {
  sub: string;
  role: 'admin' | 'member';
  tv: number;
  exp: number;
}
export interface RefreshClaims {
  sub: string;
  tv: number;
  exp: number;
}

interface TokenUser {
  id: string;
  role: 'admin' | 'member';
  tokenVersion: number;
}

const nowSec = () => Math.floor(Date.now() / 1000);

export function signAccess(user: TokenUser): Promise<string> {
  return sign(
    { sub: user.id, role: user.role, tv: user.tokenVersion, exp: nowSec() + config.accessTtlSec },
    config.authSecret,
  );
}

export function signRefresh(user: TokenUser): Promise<string> {
  return sign(
    { sub: user.id, tv: user.tokenVersion, exp: nowSec() + config.refreshTtlSec },
    config.authSecret,
  );
}

export async function verifyAccess(token: string): Promise<AccessClaims | null> {
  try {
    return (await verify(token, config.authSecret, 'HS256')) as unknown as AccessClaims;
  } catch {
    return null;
  }
}

export async function verifyRefresh(token: string): Promise<RefreshClaims | null> {
  try {
    return (await verify(token, config.authSecret, 'HS256')) as unknown as RefreshClaims;
  } catch {
    return null;
  }
}

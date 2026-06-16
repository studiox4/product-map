import { randomBytes } from 'node:crypto';

export interface AppConfig {
  isProd: boolean;
  authSecret: string;
  allowOpenSignup: boolean;
  trustProxy: boolean;
  accessTtlSec: number;
  refreshTtlSec: number;
}

const bool = (v: string | undefined) => v === 'true' || v === '1';

/** Build config from the current environment. Never throws (dev gets a fallback secret). */
export function loadConfig(): AppConfig {
  const isProd = process.env.NODE_ENV === 'production';
  const authSecret =
    process.env.AUTH_SECRET ??
    (isProd ? '' : randomBytes(32).toString('hex'));
  if (!process.env.AUTH_SECRET && !isProd) {
    console.warn('[config] AUTH_SECRET unset — using an ephemeral dev secret (sessions reset on restart).');
  }
  return {
    isProd,
    authSecret,
    allowOpenSignup: bool(process.env.ALLOW_OPEN_SIGNUP),
    trustProxy: bool(process.env.TRUST_PROXY),
    accessTtlSec: 15 * 60,
    refreshTtlSec: 30 * 24 * 60 * 60,
  };
}

/** Fail fast at boot if production is missing a required secret. */
export function assertConfig(): AppConfig {
  const cfg = loadConfig();
  if (cfg.isProd && !cfg.authSecret) {
    throw new Error('AUTH_SECRET is required in production but is unset. Refusing to boot.');
  }
  return cfg;
}

/** Singleton config for runtime use (tests call loadConfig directly to vary env). */
export const config = assertConfig();

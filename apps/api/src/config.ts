import { randomBytes } from 'node:crypto';

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
}

export interface AppConfig {
  isProd: boolean;
  authSecret: string;
  allowOpenSignup: boolean;
  trustProxy: boolean;
  accessTtlSec: number;
  refreshTtlSec: number;
  /** App base URL used to build absolute invite links in emails. */
  appUrl: string;
  /** null when SMTP is not configured → invites are link-only (air-gapped fallback). */
  smtp: SmtpConfig | null;
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
  const smtp: SmtpConfig | null = process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        user: process.env.SMTP_USER || undefined,
        pass: process.env.SMTP_PASS || undefined,
        from: process.env.SMTP_FROM ?? 'ProductMap <no-reply@productmap.local>',
      }
    : null;

  return {
    isProd,
    authSecret,
    allowOpenSignup: bool(process.env.ALLOW_OPEN_SIGNUP),
    trustProxy: bool(process.env.TRUST_PROXY),
    accessTtlSec: 15 * 60,
    refreshTtlSec: 30 * 24 * 60 * 60,
    appUrl: process.env.APP_URL ?? 'http://localhost:5173',
    smtp,
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

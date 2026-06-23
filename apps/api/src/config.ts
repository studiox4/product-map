// Browser+node safe: no node:crypto, no build-time define. Pulled in via
// tokens→auth→app on the demo path, so it must import and evaluate in a browser.

/** Cross-runtime env read (process is undefined in the browser). */
const env = (k: string): string | undefined =>
  typeof process !== 'undefined' && process.env ? process.env[k] : undefined;

/** 32 random bytes as hex via Web Crypto (Node ≥18 + browsers). */
function randomSecretHex(): string {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

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
  const isProd = env('NODE_ENV') === 'production';
  const authSecret =
    env('AUTH_SECRET') ??
    (isProd ? '' : randomSecretHex());
  if (!env('AUTH_SECRET') && !isProd) {
    console.warn('[config] AUTH_SECRET unset — using an ephemeral dev secret (sessions reset on restart).');
  }
  const smtpHost = env('SMTP_HOST');
  const smtp: SmtpConfig | null = smtpHost
    ? {
        host: smtpHost,
        port: Number(env('SMTP_PORT') ?? 587),
        user: env('SMTP_USER') || undefined,
        pass: env('SMTP_PASS') || undefined,
        from: env('SMTP_FROM') ?? 'ProductMap <no-reply@productmap.local>',
      }
    : null;

  return {
    isProd,
    authSecret,
    allowOpenSignup: bool(env('ALLOW_OPEN_SIGNUP')),
    trustProxy: bool(env('TRUST_PROXY')),
    accessTtlSec: 15 * 60,
    refreshTtlSec: 30 * 24 * 60 * 60,
    appUrl: env('APP_URL') ?? 'http://localhost:5173',
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

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

export interface ResendMailConfig {
  readonly kind: 'resend';
  readonly apiKey: string;
  readonly from: string;
}

export interface SmtpMailConfig {
  readonly kind: 'smtp';
  readonly host: string;
  readonly port: number;
  readonly user?: string;
  readonly pass?: string;
  readonly from: string;
}

export type MailConfig = ResendMailConfig | SmtpMailConfig;

export interface AppConfig {
  isProd: boolean;
  authSecret: string;
  allowOpenSignup: boolean;
  trustProxy: boolean;
  accessTtlSec: number;
  refreshTtlSec: number;
  /** App base URL used to build absolute invite links in emails. */
  appUrl: string;
  /** null when no mail backend is configured → invites are link-only (air-gapped fallback). */
  mail: MailConfig | null;
}

const bool = (v: string | undefined) => v === 'true' || v === '1';

/** Build config from the current environment. Never throws (dev gets a fallback secret). */
export function loadConfig(): AppConfig {
  const isProd = env('NODE_ENV') === 'production';
  // In a browser this is the in-page demo backend. Vite can instantiate this
  // module more than once (the demo's deep relative import vs. the app's internal
  // import resolve to distinct module URLs), and a per-instance random secret
  // would differ between the signer and verifier → every demo request 401s. A
  // public demo has no secret to protect, so use a FIXED constant in the browser:
  // every instance agrees, so sign and verify always match. The node server
  // (window === undefined) keeps the real ephemeral/AUTH_SECRET behavior.
  const inBrowser = typeof window !== 'undefined';
  const authSecret =
    env('AUTH_SECRET') ??
    (inBrowser ? 'productmap-in-browser-demo-secret' : isProd ? '' : randomSecretHex());
  if (!env('AUTH_SECRET') && !isProd) {
    console.warn('[config] AUTH_SECRET unset — using an ephemeral dev secret (sessions reset on restart).');
  }
  // Resend takes precedence over SMTP when both are configured — Resend's HTTPS API works on
  // every hosting plan, while SMTP is blocked outbound on Railway's non-Pro tier.
  const resendApiKey = env('RESEND_API_KEY');
  const smtpHost = env('SMTP_HOST');
  const mail: MailConfig | null = resendApiKey
    ? {
        kind: 'resend',
        apiKey: resendApiKey,
        from: env('RESEND_FROM') || 'ProductMap <no-reply@productmap.local>',
      }
    : smtpHost
      ? {
          kind: 'smtp',
          host: smtpHost,
          port: Number(env('SMTP_PORT') || 587),
          user: env('SMTP_USER') || undefined,
          pass: env('SMTP_PASS') || undefined,
          from: env('SMTP_FROM') || 'ProductMap <no-reply@productmap.local>',
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
    mail,
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

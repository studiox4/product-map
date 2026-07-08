import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadConfig, assertConfig } from './config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loadConfig', () => {
  it('uses a dev fallback secret when AUTH_SECRET unset and not production', () => {
    vi.stubEnv('AUTH_SECRET', undefined);
    vi.stubEnv('NODE_ENV', 'development');
    const cfg = loadConfig();
    expect(cfg.authSecret.length).toBeGreaterThan(0);
    expect(cfg.isProd).toBe(false);
  });

  it('parses ALLOW_OPEN_SIGNUP and TRUST_PROXY booleans', () => {
    vi.stubEnv('ALLOW_OPEN_SIGNUP', 'true');
    vi.stubEnv('TRUST_PROXY', 'true');
    const cfg = loadConfig();
    expect(cfg.allowOpenSignup).toBe(true);
    expect(cfg.trustProxy).toBe(true);
  });

  it('assertConfig throws in production when AUTH_SECRET is unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_SECRET', '');
    expect(() => assertConfig()).toThrow(/AUTH_SECRET/);
  });

  it('assertConfig succeeds in production when AUTH_SECRET is set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_SECRET', 'super-secret-value');
    const cfg = assertConfig();
    expect(cfg.authSecret).toBe('super-secret-value');
    expect(cfg.isProd).toBe(true);
  });
});

describe('loadConfig — mail', () => {
  it('RESEND_API_KEY set → mail.kind is resend', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('RESEND_FROM', 'ProductMap <no-reply@example.com>');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    const cfg = loadConfig();
    expect(cfg.mail).toEqual({
      kind: 'resend',
      apiKey: 're_test_key',
      from: 'ProductMap <no-reply@example.com>',
    });
  });

  it('RESEND_FROM unset → falls back to the default from address', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('RESEND_FROM', undefined);
    const cfg = loadConfig();
    expect(cfg.mail).toEqual({
      kind: 'resend',
      apiKey: 're_test_key',
      from: 'ProductMap <no-reply@productmap.local>',
    });
  });

  it('no RESEND_API_KEY, SMTP_HOST set → mail.kind is smtp (unchanged shape)', () => {
    vi.stubEnv('RESEND_API_KEY', undefined);
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_PORT', '465');
    vi.stubEnv('SMTP_USER', 'user');
    vi.stubEnv('SMTP_PASS', 'pass');
    vi.stubEnv('SMTP_FROM', 'ProductMap <no-reply@x>');
    const cfg = loadConfig();
    expect(cfg.mail).toEqual({
      kind: 'smtp',
      host: 'smtp.example.com',
      port: 465,
      user: 'user',
      pass: 'pass',
      from: 'ProductMap <no-reply@x>',
    });
  });

  it('neither RESEND_API_KEY nor SMTP_HOST set → mail is null', () => {
    vi.stubEnv('RESEND_API_KEY', undefined);
    vi.stubEnv('SMTP_HOST', undefined);
    const cfg = loadConfig();
    expect(cfg.mail).toBeNull();
  });
});

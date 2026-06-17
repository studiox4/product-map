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

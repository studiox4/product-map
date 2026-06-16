import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig, assertConfig } from './config';

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe('loadConfig', () => {
  it('uses a dev fallback secret when AUTH_SECRET unset and not production', () => {
    delete process.env.AUTH_SECRET;
    process.env.NODE_ENV = 'development';
    const cfg = loadConfig();
    expect(cfg.authSecret.length).toBeGreaterThan(0);
    expect(cfg.isProd).toBe(false);
  });

  it('parses ALLOW_OPEN_SIGNUP and TRUST_PROXY booleans', () => {
    process.env.ALLOW_OPEN_SIGNUP = 'true';
    process.env.TRUST_PROXY = 'true';
    const cfg = loadConfig();
    expect(cfg.allowOpenSignup).toBe(true);
    expect(cfg.trustProxy).toBe(true);
  });

  it('assertConfig throws in production when AUTH_SECRET is unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_SECRET;
    expect(() => assertConfig()).toThrow(/AUTH_SECRET/);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Hono } from 'hono';
import { mountWebStatic } from './serve-web';

const HERO_MARK = '<h1>HERO_HEADLINE_MARKER</h1>';
const SHELL_MARK = '<div id="root"></div><!--SPA_SHELL-->';

function buildFakeDist(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'pm-dist-'));
  mkdirSync(path.join(dir, 'assets'), { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><body>${SHELL_MARK}</body></html>`);
  writeFileSync(path.join(dir, 'marketing.html'), `<!doctype html><html><body>${HERO_MARK}</body></html>`);
  writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log("app")');
  return dir;
}

describe('mountWebStatic', () => {
  let distDir: string;

  beforeAll(() => {
    distDir = buildFakeDist();
  });
  afterAll(() => {
    rmSync(distDir, { recursive: true, force: true });
  });

  function appWithStatic() {
    const app = new Hono().get('/api/healthz', (c) => c.json({ ok: true }));
    mountWebStatic(app, { distDir, enabled: true });
    return app;
  }

  it('serves prerendered marketing HTML at exact GET /', async () => {
    const res = await appWithStatic().request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(HERO_MARK);
  });

  it('serves the SPA shell (not marketing) for /app/board', async () => {
    const res = await appWithStatic().request('/app/board');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(SHELL_MARK);
    expect(body).not.toContain(HERO_MARK);
  });

  it('leaves /api/* untouched', async () => {
    const res = await appWithStatic().request('/api/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('is inactive when disabled (dist absent / SERVE_WEB off) → / falls through to 404', async () => {
    const app = new Hono().get('/api/healthz', (c) => c.json({ ok: true }));
    mountWebStatic(app, { distDir, enabled: false });
    app.notFound((c) => c.json({ error: 'not_found' }, 404));
    const res = await app.request('/');
    expect(res.status).toBe(404);
  });
});

import { setupTestDb, truncateAll, closeTestDb } from '../test/helpers';
import { app } from '../app';
import { MIN_PASSWORD_LENGTH } from '@productmap/shared';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

beforeAll(setupTestDb);
afterAll(closeTestDb);
beforeEach(truncateAll);

const PW = 'x'.repeat(MIN_PASSWORD_LENGTH);
const json = (method: string, body: unknown, headers: Record<string, string> = {}) => ({
  method,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const cookie = (res: Response) => res.headers.get('set-cookie') ?? '';

describe('POST /api/auth/register', () => {
  it('first user becomes admin and gets cookies', async () => {
    const res = await app.request('/api/auth/register', json('POST', { email: 'a@b.co', name: 'Ada', password: PW }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.role).toBe('admin');
    expect(body.email).toBeUndefined(); // scrubbed
    expect(cookie(res)).toContain('pm_session=');
  });

  it('second self-signup is refused unless ALLOW_OPEN_SIGNUP', async () => {
    await app.request('/api/auth/register', json('POST', { email: 'a@b.co', name: 'Ada', password: PW }));
    const res = await app.request('/api/auth/register', json('POST', { email: 'c@d.co', name: 'Cy', password: PW }));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in a registered user', async () => {
    await app.request('/api/auth/register', json('POST', { email: 'a@b.co', name: 'Ada', password: PW }));
    const res = await app.request('/api/auth/login', json('POST', { email: 'a@b.co', password: PW }));
    expect(res.status).toBe(200);
    expect(cookie(res)).toContain('pm_session=');
  });

  it('returns generic 401 on wrong password (no enumeration)', async () => {
    await app.request('/api/auth/register', json('POST', { email: 'a@b.co', name: 'Ada', password: PW }));
    const res = await app.request('/api/auth/login', json('POST', { email: 'a@b.co', password: 'wrong-password' }));
    expect(res.status).toBe(401);
    const unknown = await app.request('/api/auth/login', json('POST', { email: 'nobody@x.co', password: PW }));
    expect(unknown.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user with the access cookie', async () => {
    const reg = await app.request('/api/auth/register', json('POST', { email: 'a@b.co', name: 'Ada', password: PW }));
    const setCookie = cookie(reg).split(';')[0]; // pm_session=...
    const res = await app.request('/api/auth/me', { headers: { cookie: setCookie } });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('Ada');
  });

  it('401 without a cookie', async () => {
    expect((await app.request('/api/auth/me')).status).toBe(401);
  });
});

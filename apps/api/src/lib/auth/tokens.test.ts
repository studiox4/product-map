import { describe, it, expect } from 'vitest';
import { signAccess, verifyAccess, signRefresh, verifyRefresh } from './tokens';

const user = { id: 'u-1', role: 'admin' as const, tokenVersion: 3 };

describe('access tokens', () => {
  it('round-trips claims', async () => {
    const token = await signAccess(user);
    const claims = await verifyAccess(token);
    expect(claims).toMatchObject({ sub: 'u-1', role: 'admin', tv: 3 });
  });

  it('verifyAccess returns null on a tampered/invalid token', async () => {
    expect(await verifyAccess('garbage.token.value')).toBeNull();
  });
});

describe('refresh tokens', () => {
  it('round-trips sub + tv', async () => {
    const token = await signRefresh(user);
    const claims = await verifyRefresh(token);
    expect(claims).toMatchObject({ sub: 'u-1', tv: 3 });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createCommunityProvider, createEntitlementProvider } from '@productmap/sdk';
import { setEntitlementProvider, requireFeature } from './entitlements';

// Reset to community provider before each test so a future appended test
// cannot silently inherit an entitled provider set by a prior test.
beforeEach(() => setEntitlementProvider(createCommunityProvider()));

function appWithGate() {
  return new Hono().get('/x', requireFeature('analytics'), (c) => c.json({ ok: true }));
}

describe('requireFeature', () => {
  it('402s when the feature is not entitled (community)', async () => {
    setEntitlementProvider(createCommunityProvider());
    const res = await appWithGate().request('/x');
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: 'feature_not_entitled', feature: 'analytics' });
  });

  it('allows when the feature is entitled', async () => {
    setEntitlementProvider(createEntitlementProvider({
      features: new Set(['analytics']),
      limits: { projects: -1, members: -1, seats: -1 },
      expiresAt: null,
    }));
    const res = await appWithGate().request('/x');
    expect(res.status).toBe(200);
  });
});

import { describe, it, expect } from 'vitest';
import { createCommunityProvider, COMMUNITY_LIMITS } from './entitlements';

describe('CommunityProvider', () => {
  const p = createCommunityProvider();

  it('disables every paid feature', () => {
    for (const f of ['ai.copilot', 'integrations', 'notifications.delivery', 'analytics'] as const) {
      expect(p.can(f)).toBe(false);
    }
  });

  it('reports community caps', () => {
    expect(p.limit('projects')).toBe(COMMUNITY_LIMITS.projects);
    expect(p.limit('members')).toBe(COMMUNITY_LIMITS.members);
  });

  it('never expires', () => {
    expect(p.get().expiresAt).toBeNull();
  });
});

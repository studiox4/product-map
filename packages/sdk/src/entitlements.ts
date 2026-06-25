export type Feature = 'ai.copilot' | 'integrations' | 'notifications.delivery' | 'analytics';
export type LimitKey = 'projects' | 'members' | 'seats';

export interface Entitlements {
  features: ReadonlySet<Feature>;
  limits: Readonly<Record<LimitKey, number>>; // -1 = unlimited
  expiresAt: number | null; // epoch ms, null = never expires
}

export interface EntitlementProvider {
  get(): Entitlements;
  can(feature: Feature): boolean;
  limit(key: LimitKey): number;
}

// Free-tier caps. Tunable product values; -1 = unlimited.
export const COMMUNITY_LIMITS: Record<LimitKey, number> = {
  projects: 3,
  members: 10,
  seats: 10,
};

export function createEntitlementProvider(snapshot: Entitlements): EntitlementProvider {
  return {
    get: () => snapshot,
    can: (feature) => snapshot.features.has(feature),
    limit: (key) => snapshot.limits[key],
  };
}

export function createCommunityProvider(): EntitlementProvider {
  return createEntitlementProvider({
    features: new Set<Feature>(), // no paid features
    limits: { ...COMMUNITY_LIMITS },
    expiresAt: null,
  });
}

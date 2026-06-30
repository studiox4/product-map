import type { MiddlewareHandler } from 'hono';
import type { EntitlementProvider, Feature } from '@productmap/sdk';
import { createCommunityProvider } from '@productmap/sdk';

// Fail-safe default: deny paid features until a provider is explicitly set.
let provider: EntitlementProvider = createCommunityProvider();

export function setEntitlementProvider(p: EntitlementProvider): void {
  provider = p;
}

export function getEntitlements(): EntitlementProvider {
  return provider;
}

export function requireFeature(feature: Feature): MiddlewareHandler {
  return async (c, next) => {
    if (!provider.can(feature)) {
      return c.json({ error: 'feature_not_entitled', feature }, 402);
    }
    return next();
  };
}

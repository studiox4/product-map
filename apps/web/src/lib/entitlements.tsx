import { createContext, useContext, type ReactNode } from 'react';
import {
  createCommunityProvider,
  type EntitlementProvider,
  type Feature,
} from '@productmap/sdk';

// UX-only: hides/labels paid affordances in the React tree. NEVER the real gate
// — the server's requireFeature is the enforcement boundary (Global Constraints).
const EntitlementsContext = createContext<EntitlementProvider>(createCommunityProvider());

export function EntitlementsProvider({
  children,
  provider,
}: {
  children: ReactNode;
  provider?: EntitlementProvider;
}) {
  return (
    <EntitlementsContext.Provider value={provider ?? createCommunityProvider()}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlement(feature: Feature): boolean {
  return useContext(EntitlementsContext).can(feature);
}

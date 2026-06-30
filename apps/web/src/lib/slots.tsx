import { lazy, Suspense, type ComponentType } from 'react';
import { slotRegistry, type SlotId, type SlotRegistration } from '@productmap/sdk';

// Module-level cache: each loader function maps to exactly one lazy component.
// This ensures stable component identity across re-renders — calling lazy()
// inside render would create a new component object each time, causing React
// to unmount/remount and re-suspend on every parent re-render.
const lazyCache = new Map<SlotRegistration['loader'], ComponentType>();

function lazyFor(reg: SlotRegistration): ComponentType {
  let C = lazyCache.get(reg.loader);
  if (!C) {
    C = lazy(reg.loader as () => Promise<{ default: ComponentType }>);
    lazyCache.set(reg.loader, C);
  }
  return C;
}

// Build-time composition: the edition registers a loader into slotRegistry at
// module-load; we lazy-import it. No runtime/network plugin loading.
// UX-only: client slot rendering hides unavailable UI. NEVER the real gate —
// the server's requireFeature is the enforcement boundary (Global Constraints).
export function Slot({ id }: { id: SlotId }) {
  const reg = slotRegistry.get(id);
  if (!reg) return null; // empty slot → nothing (community default)
  const Component = lazyFor(reg);
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
}

// Exported for testing only — allows asserting stable component identity.
export { lazyFor };

import { lazy, Suspense, type ComponentType } from 'react';
import { slotRegistry, type SlotId } from '@productmap/sdk';

// Build-time composition: the edition registers a loader into slotRegistry at
// module-load; we lazy-import it. No runtime/network plugin loading.
// UX-only: client slot rendering hides unavailable UI. NEVER the real gate —
// the server's requireFeature is the enforcement boundary (Global Constraints).
export function Slot({ id }: { id: SlotId }) {
  const reg = slotRegistry.get(id);
  if (!reg) return null; // empty slot → nothing (community default)
  const Component = lazy(reg.loader as () => Promise<{ default: ComponentType }>);
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
}

import { useEffect, useState } from 'react';

/**
 * false during SSR and the first client render; true after mount.
 * Gate every hidden motion initial state behind this so the prerendered HTML
 * ships the FINAL, visible state (no opacity:0 baked in).
 */
export function useEntrance(): boolean {
  const [entered, setEntered] = useState(false);
  useEffect(() => setEntered(true), []);
  return entered;
}

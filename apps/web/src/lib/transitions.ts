import type { CSSProperties } from 'react';
import { flushSync } from 'react-dom';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Shared-element morph pairs (Spec 1.3): elements with matching names morph. */
export type MorphPrefix = 'feature' | 'feature-peek' | 'doc-title';

type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => unknown;
};

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

export function supportsViewTransitions(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof (document as DocumentWithViewTransition).startViewTransition === 'function'
  );
}

/**
 * Run a navigation (or any DOM-updating state change) inside a View
 * Transition. Graceful no-op fallback: unsupported browsers and
 * reduced-motion users get the same end state with no morph/crossfade.
 * flushSync makes React commit synchronously inside the transition
 * callback so the browser snapshots the post-navigation state.
 */
export function navigateWithTransition(update: () => void): void {
  if (!supportsViewTransitions() || prefersReducedMotion()) {
    update();
    return;
  }
  (document as DocumentWithViewTransition).startViewTransition!(() => {
    flushSync(update);
  });
}

/** Stable `view-transition-name` for a morph pair (prefix keeps it a valid CSS ident). */
export function morphName(prefix: MorphPrefix, id: string): string {
  return `${prefix}-${id}`;
}

/** Inline style carrying the `view-transition-name` for a morph pair. */
export function morphStyle(prefix: MorphPrefix, id: string): CSSProperties {
  return { viewTransitionName: morphName(prefix, id) } as CSSProperties;
}

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  morphName,
  morphStyle,
  navigateWithTransition,
  prefersReducedMotion,
  supportsViewTransitions,
} from './transitions';

function mockMatchMedia(prefersReduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: prefersReduced,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

function installStartViewTransition() {
  const startViewTransition = vi.fn((update: () => void | Promise<void>) => {
    void update();
    return {};
  });
  // jsdom doesn't implement the View Transitions API; install a configurable
  // mock (lib.dom types the method as non-optional, so no plain assignment).
  Object.defineProperty(document, 'startViewTransition', {
    value: startViewTransition,
    configurable: true,
    writable: true,
  });
  return startViewTransition;
}

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('is false when matchMedia is unavailable (jsdom default)', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it('follows the media query', () => {
    mockMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    mockMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('supportsViewTransitions', () => {
  it('is false without document.startViewTransition', () => {
    expect(supportsViewTransitions()).toBe(false);
  });

  it('is true when document.startViewTransition exists', () => {
    installStartViewTransition();
    expect(supportsViewTransitions()).toBe(true);
  });
});

describe('navigateWithTransition', () => {
  it('falls back to a plain call when the API is unsupported', () => {
    mockMatchMedia(false);
    const update = vi.fn();
    navigateWithTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('falls back to a plain call when the user prefers reduced motion', () => {
    mockMatchMedia(true);
    const startViewTransition = installStartViewTransition();
    const update = vi.fn();
    navigateWithTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it('runs the update inside startViewTransition when supported', () => {
    mockMatchMedia(false);
    const startViewTransition = installStartViewTransition();
    const update = vi.fn();
    navigateWithTransition(update);
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('morphName / morphStyle', () => {
  it('builds a stable prefixed name (valid CSS ident even for uuid ids)', () => {
    expect(morphName('feature', '123e4567-e89b')).toBe('feature-123e4567-e89b');
    expect(morphName('doc-title', 'abc')).toBe('doc-title-abc');
  });

  it('returns an inline style with the view-transition-name', () => {
    expect(morphStyle('feature-peek', 'abc')).toEqual({
      viewTransitionName: 'feature-peek-abc',
    });
  });
});

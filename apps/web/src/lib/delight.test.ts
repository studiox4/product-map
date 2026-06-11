import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import confetti from 'canvas-confetti';
import {
  confettiBurst,
  emojiParticleBurst,
  frostRing,
  makeHoverPrefetch,
  prefersReducedMotion,
} from './delight';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('prefersReducedMotion', () => {
  it('reflects the media query', () => {
    stubReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    stubReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('reduced-motion no-ops', () => {
  beforeEach(() => stubReducedMotion(true));

  it('emojiParticleBurst appends nothing', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    emojiParticleBurst(el, '🚀');
    expect(document.querySelectorAll('[data-delight="particle"]')).toHaveLength(0);
  });

  it('frostRing appends nothing', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    frostRing(el);
    expect(document.querySelectorAll('[data-delight="frost-ring"]')).toHaveLength(0);
  });

  it('confettiBurst does not fire', () => {
    confettiBurst();
    expect(confetti).not.toHaveBeenCalled();
  });
});

describe('with motion allowed', () => {
  beforeEach(() => stubReducedMotion(false));

  it('emojiParticleBurst spawns 6-8 particles and cleans up after 500ms', () => {
    vi.useFakeTimers();
    const el = document.createElement('button');
    document.body.appendChild(el);
    emojiParticleBurst(el, '🚀');
    const particles = document.querySelectorAll('[data-delight="particle"]');
    expect(particles.length).toBeGreaterThanOrEqual(6);
    expect(particles.length).toBeLessThanOrEqual(8);
    expect(particles[0]?.textContent).toBe('🚀');
    vi.advanceTimersByTime(500);
    expect(document.querySelectorAll('[data-delight="particle"]')).toHaveLength(0);
  });

  it('frostRing spawns a ring and cleans up after 400ms', () => {
    vi.useFakeTimers();
    const el = document.createElement('button');
    document.body.appendChild(el);
    frostRing(el);
    expect(document.querySelectorAll('[data-delight="frost-ring"]')).toHaveLength(1);
    vi.advanceTimersByTime(400);
    expect(document.querySelectorAll('[data-delight="frost-ring"]')).toHaveLength(0);
  });

  it('confettiBurst fires one low-count brand burst', () => {
    confettiBurst();
    expect(confetti).toHaveBeenCalledTimes(1);
    expect(confetti).toHaveBeenCalledWith(
      expect.objectContaining({ particleCount: 80, disableForReducedMotion: true }),
    );
  });
});

describe('makeHoverPrefetch', () => {
  beforeEach(() => vi.useFakeTimers());

  it('fires once after the debounce delay', () => {
    const prefetch = vi.fn();
    const handlers = makeHoverPrefetch(prefetch, 150);
    handlers.onMouseEnter();
    expect(prefetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it('cancels when the pointer leaves before the delay', () => {
    const prefetch = vi.fn();
    const handlers = makeHoverPrefetch(prefetch, 150);
    handlers.onMouseEnter();
    vi.advanceTimersByTime(100);
    handlers.onMouseLeave();
    vi.advanceTimersByTime(500);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('fires exactly once per hover burst (rapid enter/leave then rest)', () => {
    const prefetch = vi.fn();
    const handlers = makeHoverPrefetch(prefetch, 150);
    handlers.onMouseEnter();
    vi.advanceTimersByTime(50);
    handlers.onMouseLeave();
    handlers.onMouseEnter();
    vi.advanceTimersByTime(50);
    handlers.onMouseLeave();
    handlers.onMouseEnter();
    vi.advanceTimersByTime(150);
    expect(prefetch).toHaveBeenCalledTimes(1);
    // subsequent hovers never refire — cache owns it now
    handlers.onMouseEnter();
    vi.advanceTimersByTime(1000);
    expect(prefetch).toHaveBeenCalledTimes(1);
  });
});

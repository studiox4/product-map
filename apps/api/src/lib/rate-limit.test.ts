import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rate-limit';

describe('RateLimiter', () => {
  it('allows up to `max` hits per key then blocks', () => {
    const rl = new RateLimiter({ max: 2, windowMs: 60_000 });
    expect(rl.hit('1.1.1.1')).toBe(true);
    expect(rl.hit('1.1.1.1')).toBe(true);
    expect(rl.hit('1.1.1.1')).toBe(false);
    expect(rl.hit('2.2.2.2')).toBe(true); // separate key unaffected
  });

  it('resets after the window elapses', () => {
    let now = 0;
    const rl = new RateLimiter({ max: 1, windowMs: 1000, clock: () => now });
    expect(rl.hit('k')).toBe(true);
    expect(rl.hit('k')).toBe(false);
    now = 1001;
    expect(rl.hit('k')).toBe(true);
  });
});

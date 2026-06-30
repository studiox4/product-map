import { describe, it, expect } from 'vitest';
import { createSlotRegistry } from './slots';

describe('slot registry', () => {
  it('returns undefined for an unfilled slot', () => {
    expect(createSlotRegistry().get('nav.analytics')).toBeUndefined();
  });

  it('stores and retrieves a registration', () => {
    const reg = createSlotRegistry();
    const loader = async () => ({ default: 'x' });
    reg.register({ id: 'nav.analytics', loader });
    expect(reg.has('nav.analytics')).toBe(true);
    expect(reg.get('nav.analytics')?.loader).toBe(loader);
  });

  it('last registration wins for the same id', () => {
    const reg = createSlotRegistry();
    const l1 = async () => ({}); const l2 = async () => ({});
    reg.register({ id: 'copilot.panel', loader: l1 });
    reg.register({ id: 'copilot.panel', loader: l2 });
    expect(reg.get('copilot.panel')?.loader).toBe(l2);
  });
});

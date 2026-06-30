import { describe, it, expect } from 'vitest';
import * as sdk from './index';

describe('@productmap/sdk', () => {
  it('is importable', () => {
    expect(typeof sdk).toBe('object');
  });
});

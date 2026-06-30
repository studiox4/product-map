import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { EntitlementsProvider, useEntitlement } from './entitlements';

describe('useEntitlement', () => {
  it('is false for paid features under the default community provider', () => {
    const { result } = renderHook(() => useEntitlement('analytics'), {
      wrapper: ({ children }) => <EntitlementsProvider>{children}</EntitlementsProvider>,
    });
    expect(result.current).toBe(false);
  });
});

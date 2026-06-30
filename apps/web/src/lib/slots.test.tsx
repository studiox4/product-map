import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { slotRegistry } from '@productmap/sdk';
import { Slot, lazyFor } from './slots';

describe('<Slot>', () => {
  it('renders nothing for an unfilled slot', () => {
    const { container } = render(<Slot id="copilot.panel" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the registered component', async () => {
    slotRegistry.register({
      id: 'nav.analytics',
      loader: async () => ({ default: () => <span>ANALYTICS</span> }),
    });
    render(<Slot id="nav.analytics" />);
    await waitFor(() => expect(screen.getByText('ANALYTICS')).toBeTruthy());
  });

  it('returns the same lazy component reference on repeated calls (identity stability)', () => {
    const loader = async () => ({ default: () => <span>STABLE</span> });
    slotRegistry.register({ id: 'settings.integrations', loader });
    const reg = slotRegistry.get('settings.integrations')!;
    const first = lazyFor(reg);
    const second = lazyFor(reg);
    // If lazy() were called inside render each time, this would fail because
    // each call to lazy() produces a distinct component object.
    expect(first).toBe(second);
  });
});

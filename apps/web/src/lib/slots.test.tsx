import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { slotRegistry } from '@productmap/sdk';
import { Slot } from './slots';

describe('<Slot>', () => {
  beforeEach(() => {
    // Reset the registry between tests by re-creating it would require access to
    // internal state; instead we rely on unique slot IDs per test.
  });

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
});

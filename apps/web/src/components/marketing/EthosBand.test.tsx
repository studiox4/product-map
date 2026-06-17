import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import EthosBand from './EthosBand';

afterEach(cleanup);

describe('EthosBand', () => {
  it('renders the four ethos callouts', () => {
    render(<EthosBand />);
    expect(screen.getByText(/offline/i)).toBeTruthy();
    expect(screen.getByText(/air-gapped/i)).toBeTruthy();
    expect(screen.getByText(/your markdown is yours/i)).toBeTruthy();
    expect(screen.getByText(/open source/i)).toBeTruthy();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CountUp } from '../CountUp';

describe('CountUp', () => {
  it('renders the final value as text on first render (SSR-safe)', () => {
    render(<CountUp value={1234} />);
    expect(screen.getByText('1,234')).toBeTruthy();
  });
});

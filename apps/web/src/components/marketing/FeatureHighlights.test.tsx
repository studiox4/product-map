import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import FeatureHighlights from './FeatureHighlights';

afterEach(cleanup);

describe('FeatureHighlights', () => {
  it('renders four feature cards', () => {
    render(<FeatureHighlights />);
    expect(screen.getByRole('heading', { name: /roadmap & horizons/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /feature hub/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /releases/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /ai copilot/i })).toBeTruthy();
  });
});

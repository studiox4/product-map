import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotionProvider } from '../MotionProvider';
import { HeroGraphic } from '../HeroGraphic';

describe('HeroGraphic', () => {
  it('renders four Stagger bars (tagged data-bar)', () => {
    const { container } = render(
      <MotionProvider>
        <HeroGraphic />
      </MotionProvider>,
    );
    expect(container.querySelectorAll('rect[data-bar]').length).toBe(4);
  });

  it('renders faint vertical gridlines with data-grid attribute', () => {
    const { container } = render(
      <MotionProvider>
        <HeroGraphic />
      </MotionProvider>,
    );
    expect(container.querySelectorAll('line[data-grid]').length).toBeGreaterThanOrEqual(3);
  });
});

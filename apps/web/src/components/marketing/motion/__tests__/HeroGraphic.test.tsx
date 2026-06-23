import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotionProvider } from '../MotionProvider';
import { HeroGraphic } from '../HeroGraphic';

describe('HeroGraphic', () => {
  it('renders four Stagger bars as SVG rects', () => {
    const { container } = render(
      <MotionProvider>
        <HeroGraphic />
      </MotionProvider>,
    );
    expect(container.querySelectorAll('rect').length).toBe(4);
  });
});

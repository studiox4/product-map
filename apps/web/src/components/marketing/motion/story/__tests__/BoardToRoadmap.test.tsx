// apps/web/src/components/marketing/motion/story/__tests__/BoardToRoadmap.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotionProvider } from '../../MotionProvider';
import { BoardToRoadmap } from '../BoardToRoadmap';

describe('BoardToRoadmap', () => {
  it('renders an svg with the three roadmap bars', () => {
    const { container } = render(
      <MotionProvider>
        <BoardToRoadmap />
      </MotionProvider>,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelectorAll('[data-bar]').length).toBe(3);
  });
});

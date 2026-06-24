import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotionProvider } from '../../MotionProvider';
import { ScenarioFork } from '../ScenarioFork';

describe('ScenarioFork', () => {
  it('renders the committed plan and the what-if ghost bars', () => {
    const { container } = render(
      <MotionProvider>
        <ScenarioFork />
      </MotionProvider>,
    );
    expect(container.querySelectorAll('[data-bar]').length).toBe(3);
    expect(container.querySelectorAll('[data-ghost]').length).toBe(3);
  });
});

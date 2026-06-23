import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MotionProvider } from '../MotionProvider';
import { Reveal } from '../Reveal';

describe('Reveal', () => {
  it('renders its children (content is never gated away)', () => {
    render(
      <MotionProvider>
        <Reveal>
          <p>visible content</p>
        </Reveal>
      </MotionProvider>,
    );
    expect(screen.getByText('visible content')).toBeTruthy();
  });
});

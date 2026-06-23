// apps/web/src/components/marketing/motion/story/__tests__/CopilotPulse.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotionProvider } from '../../MotionProvider';
import { CopilotPulse } from '../CopilotPulse';

describe('CopilotPulse', () => {
  it('renders a spark glyph', () => {
    const { container } = render(
      <MotionProvider><CopilotPulse /></MotionProvider>,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

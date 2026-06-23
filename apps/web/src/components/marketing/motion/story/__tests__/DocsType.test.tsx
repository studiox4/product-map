// apps/web/src/components/marketing/motion/story/__tests__/DocsType.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotionProvider } from '../../MotionProvider';
import { DocsType } from '../DocsType';

describe('DocsType', () => {
  it('renders typed doc lines', () => {
    const { container } = render(
      <MotionProvider><DocsType /></MotionProvider>,
    );
    expect(container.querySelectorAll('[data-line]').length).toBeGreaterThanOrEqual(3);
  });
});

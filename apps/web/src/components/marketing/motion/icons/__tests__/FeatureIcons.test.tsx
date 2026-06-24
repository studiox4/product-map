import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MotionProvider } from '../../MotionProvider';
import { RoadmapIcon, DocsIcon, ReleasesIcon, CopilotIcon } from '../FeatureIcons';

describe('FeatureIcons', () => {
  it('each icon renders an svg', () => {
    for (const Icon of [RoadmapIcon, DocsIcon, ReleasesIcon, CopilotIcon]) {
      const { container } = render(<MotionProvider><Icon /></MotionProvider>);
      expect(container.querySelector('svg')).toBeTruthy();
    }
  });
});

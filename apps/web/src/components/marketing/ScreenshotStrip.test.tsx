import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ScreenshotStrip from './ScreenshotStrip';

afterEach(cleanup);

describe('ScreenshotStrip', () => {
  it('renders framed images from /marketing/', () => {
    render(<ScreenshotStrip />);
    const imgs = screen.getAllByRole('img');
    const srcs = imgs.map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(
      expect.arrayContaining(['/marketing/board.png', '/marketing/roadmap.png', '/marketing/feature.png']),
    );
  });
});

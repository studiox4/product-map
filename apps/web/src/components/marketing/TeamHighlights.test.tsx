import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MotionProvider } from '@/components/marketing/motion/MotionProvider';
import TeamHighlights from './TeamHighlights';

afterEach(cleanup);

function renderSection() {
  return render(
    <MotionProvider>
      <TeamHighlights />
    </MotionProvider>,
  );
}

describe('TeamHighlights', () => {
  it('renders the "Built for teams" heading and all four capability cards', () => {
    renderSection();
    expect(screen.getByRole('heading', { name: /built for teams/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /multiple projects, one workspace/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /your team, the right access/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /share roadmaps, publicly/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /collect ideas from anyone/i })).toBeTruthy();
  });

  it('renders each card with a decorative illustration', () => {
    renderSection();
    const illustrations = screen.getAllByRole('img');
    expect(illustrations.length).toBe(4);
  });
});

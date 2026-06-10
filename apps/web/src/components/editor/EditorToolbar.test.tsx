import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EditorToolbar } from './EditorToolbar';

afterEach(cleanup);

function renderToolbar(overrides: Partial<Parameters<typeof EditorToolbar>[0]> = {}) {
  const props = {
    backHref: '/board?feature=f1',
    backLabel: 'Rich markdown editor',
    title: 'Rich markdown editor — PRD',
    onRenameTitle: vi.fn(),
    status: 'draft' as const,
    onStatusChange: vi.fn(),
    saveState: 'idle' as const,
    exportHref: '/api/documents/d1/export.md',
    ...overrides,
  };
  render(
    <MemoryRouter>
      <EditorToolbar {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe('EditorToolbar', () => {
  it('shows "Saving…" while saving and "Saved" after', () => {
    renderToolbar({ saveState: 'saving' });
    expect(screen.getByText('Saving…')).toBeTruthy();
  });

  it('shows Saved indicator', () => {
    renderToolbar({ saveState: 'saved' });
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('shows a persistent amber banner on save error', () => {
    renderToolbar({ saveState: 'error' });
    expect(screen.getByText(/Unsaved changes — retrying/)).toBeTruthy();
  });

  it('does not show the banner when idle', () => {
    renderToolbar({ saveState: 'idle' });
    expect(screen.queryByText(/Unsaved changes/)).toBeNull();
  });

  it('renders back link to the feature and an export link', () => {
    renderToolbar();
    const back = screen.getByRole('link', { name: /Rich markdown editor/ });
    expect(back.getAttribute('href')).toContain('/board');
    const exportLink = screen.getByRole('link', { name: /Export \.md/ });
    expect(exportLink.getAttribute('href')).toBe('/api/documents/d1/export.md');
  });

  it('calls onRenameTitle on blur when the title changed', () => {
    const props = renderToolbar();
    const input = screen.getByDisplayValue('Rich markdown editor — PRD');
    fireEvent.change(input, { target: { value: 'New title' } });
    fireEvent.blur(input);
    expect(props.onRenameTitle).toHaveBeenCalledWith('New title');
  });

  it('does not call onRenameTitle when the title is unchanged or empty', () => {
    const props = renderToolbar();
    const input = screen.getByDisplayValue('Rich markdown editor — PRD');
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(props.onRenameTitle).not.toHaveBeenCalled();
  });
});

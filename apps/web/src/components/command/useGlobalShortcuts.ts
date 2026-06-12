import { useEffect } from 'react';

/** Window event dispatched by the palette's "Toggle comments" action; the doc editor listens. */
export const TOGGLE_COMMENTS_EVENT = 'pm:toggle-comments';

/** True when a key event originated in a place where the user is typing. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** True while any Radix dialog/sheet (incl. the palette itself) is open — list shortcuts stay quiet. */
export function hasOpenOverlay(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

interface GlobalShortcutHandlers {
  /** ⌘K / Ctrl+K. */
  onTogglePalette: () => void;
  /** `?` when not typing in an input. */
  onToggleShortcuts: () => void;
  /** ⌘J / Ctrl+J — copilot panel (omitted when AI is disabled). */
  onToggleCopilot?: () => void;
}

/**
 * App-wide keyboard listeners for the command palette (⌘K / Ctrl+K) and the
 * shortcuts overlay (`?`). Mounted once in AppShell.
 */
export function useGlobalShortcuts({
  onTogglePalette,
  onToggleShortcuts,
  onToggleCopilot,
}: GlobalShortcutHandlers): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onTogglePalette();
        return;
      }
      if (
        onToggleCopilot &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        e.key.toLowerCase() === 'j'
      ) {
        e.preventDefault();
        onToggleCopilot();
        return;
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        onToggleShortcuts();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onTogglePalette, onToggleShortcuts, onToggleCopilot]);
}

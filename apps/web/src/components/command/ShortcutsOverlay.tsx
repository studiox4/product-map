import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@productmap/ui';

interface ShortcutsOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isMac =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

interface Shortcut {
  keys: string[];
  label: string;
}

const GROUPS: { heading: string; shortcuts: Shortcut[] }[] = [
  {
    heading: 'Global',
    shortcuts: [
      { keys: [`${MOD} K`], label: 'Command palette' },
      { keys: ['?'], label: 'Keyboard shortcuts' },
      { keys: ['Esc'], label: 'Close dialog / panel' },
    ],
  },
  {
    heading: 'Docs & board',
    shortcuts: [
      { keys: ['J'], label: 'Next row / card' },
      { keys: ['K'], label: 'Previous row / card' },
      { keys: ['Enter'], label: 'Open selection' },
    ],
  },
  {
    heading: 'Editor',
    shortcuts: [
      { keys: ['/'], label: 'Insert block (slash menu)' },
      { keys: [`${MOD} B`], label: 'Bold' },
      { keys: [`${MOD} I`], label: 'Italic' },
    ],
  },
  {
    heading: 'Palette',
    shortcuts: [
      { keys: ['↑', '↓'], label: 'Move selection' },
      { keys: ['Enter'], label: 'Run command' },
      { keys: ['⌫'], label: 'Back (empty search)' },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-inset px-1.5 font-sans text-[11px] font-semibold text-body-ink shadow-sm-card">
      {children}
    </kbd>
  );
}

/** `?` overlay: a rounded-2xl card grid of the app's keyboard shortcuts. */
export function ShortcutsOverlay({ open, onOpenChange }: ShortcutsOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-ink">Keyboard shortcuts</DialogTitle>
          <DialogDescription>Move faster around ProductMap.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section
              key={group.heading}
              className="rounded-2xl bg-panel p-4"
              aria-label={group.heading}
            >
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-ink">
                {group.heading}
              </h3>
              <ul className="space-y-2.5">
                {group.shortcuts.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-body-ink">{s.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {s.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ShortcutsOverlay;

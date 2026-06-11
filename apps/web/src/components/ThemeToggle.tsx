import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  cycleTheme,
  getStoredTheme,
  initSystemThemeListener,
  onThemeChange,
  setTheme,
  type Theme,
} from '@/lib/theme';

const THEME_META: Record<Theme, { icon: typeof Sun; label: string }> = {
  light: { icon: Sun, label: 'Light theme' },
  dark: { icon: Moon, label: 'Dark theme' },
  system: { icon: Monitor, label: 'System theme' },
};

export function ThemeToggle() {
  const [theme, setLocalTheme] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    const offChange = onThemeChange(setLocalTheme);
    const offSystem = initSystemThemeListener();
    return () => {
      offChange();
      offSystem();
    };
  }, []);

  const next = cycleTheme(theme);
  const { icon: Icon, label } = THEME_META[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="flex h-8 w-8 items-center justify-center rounded-full text-body-ink outline-none transition-all duration-150 ease-out hover:bg-surface/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${label} — switch to ${next}`}
      title={`Theme: ${theme} (click for ${next})`}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}

export default ThemeToggle;

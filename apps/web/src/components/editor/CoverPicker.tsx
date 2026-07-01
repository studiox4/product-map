import { Check } from 'lucide-react';
import { cn } from '@productmap/ui/lib/utils';

/** 8 curated Soft Studio gradient covers (spec 2.3), keyed by `documents.cover`. */
export const DOC_COVERS: Record<string, { label: string; css: string }> = {
  dawn: { label: 'Dawn', css: 'linear-gradient(135deg, #dcebff 0%, #fdf0e3 100%)' },
  tide: { label: 'Tide', css: 'linear-gradient(135deg, #d9f2f0 0%, #dcebff 100%)' },
  meadow: { label: 'Meadow', css: 'linear-gradient(135deg, #e4f0e4 0%, #d9f2f0 100%)' },
  ember: { label: 'Ember', css: 'linear-gradient(135deg, #fdf0e3 0%, #fcebe3 100%)' },
  lilac: { label: 'Lilac', css: 'linear-gradient(135deg, #efe3fb 0%, #e8eafb 100%)' },
  dusk: { label: 'Dusk', css: 'linear-gradient(135deg, #e8eafb 0%, #dcebff 100%)' },
  slate: { label: 'Slate', css: 'linear-gradient(135deg, #e7ebf2 0%, #eef1ec 100%)' },
  horizon: { label: 'Horizon', css: 'linear-gradient(135deg, #2b557e 0%, #3c6b46 100%)' },
};

/** CSS gradient for a cover key, or undefined when unset/unknown. */
export function coverCss(key: string | null | undefined): string | undefined {
  return key ? DOC_COVERS[key]?.css : undefined;
}

export interface CoverPickerProps {
  value: string | null;
  onChange: (cover: string | null) => void;
}

/** Swatch grid for picking a doc cover gradient (lives in the toolbar ⋯ menu). */
export function CoverPicker({ value, onChange }: CoverPickerProps) {
  return (
    <div className="px-2 py-1.5">
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Cover gradient">
        {Object.entries(DOC_COVERS).map(([key, cover]) => {
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              title={cover.label}
              aria-label={`Cover: ${cover.label}`}
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : key)}
              className={cn(
                'flex h-8 w-10 items-center justify-center rounded-lg border transition-shadow duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected ? 'border-action shadow-sm' : 'border-line hover:border-line-strong',
              )}
              style={{ background: cover.css }}
            >
              {selected ? (
                <Check className="h-3.5 w-3.5 text-action" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>
      {value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-2 w-full rounded-full px-2 py-1 text-xs text-muted-ink transition-colors duration-150 ease-out hover:bg-secondary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Remove cover
        </button>
      ) : null}
    </div>
  );
}

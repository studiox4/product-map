import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { FEATURE_SIZES, type FeatureSize, type FeatureWithDocs } from '@productmap/shared';
import { useUpdateFeature } from '@/lib/api';
import { Textarea, cn } from '@productmap/ui';

export const SIZE_LABELS: Record<FeatureSize, string> = { s: 'S', m: 'M', l: 'L' };

/**
 * Right-rail Size + Risk card (D4/D6): S/M/L pill select (click the active
 * pill to clear) and a collapsible markdown risk-notes textarea (saves on blur).
 */
export function SizeRiskRail({ feature }: { feature: FeatureWithDocs }) {
  const updateFeature = useUpdateFeature();
  const [riskOpen, setRiskOpen] = useState(Boolean(feature.riskMd));
  const [riskDraft, setRiskDraft] = useState(feature.riskMd);

  const setSize = (size: FeatureSize) => {
    const next = feature.size === size ? null : size;
    updateFeature.mutate(
      { id: feature.id, size: next },
      { onError: () => toast.error(`Couldn't update size for '${feature.title}' — restored`) },
    );
  };

  const saveRisk = () => {
    if (riskDraft === feature.riskMd) return;
    updateFeature.mutate(
      { id: feature.id, riskMd: riskDraft },
      { onError: () => toast.error(`Couldn't save risk notes for '${feature.title}' — restored`) },
    );
  };

  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-card" aria-label="Size and risk">
      <h2 className="font-display text-sm font-semibold text-ink">Size</h2>
      <div role="group" aria-label="Size" className="flex gap-1.5">
        {FEATURE_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={feature.size === s}
            aria-label={`Size ${SIZE_LABELS[s]}`}
            onClick={() => setSize(s)}
            className={cn(
              'h-8 w-10 rounded-full text-sm font-semibold transition-colors duration-150 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              feature.size === s
                ? 'bg-action-soft text-action'
                : 'bg-inset text-muted-ink hover:bg-wash hover:text-body-ink',
            )}
          >
            {SIZE_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="border-t border-line pt-3">
        <button
          type="button"
          aria-expanded={riskOpen}
          onClick={() => setRiskOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full font-display text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:text-body-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {riskOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-ink" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-ink" aria-hidden />
          )}
          Risk notes
        </button>
        {riskOpen ? (
          <Textarea
            aria-label="Risk notes"
            value={riskDraft}
            onChange={(e) => setRiskDraft(e.target.value)}
            onBlur={saveRisk}
            placeholder="What could go wrong? Markdown works…"
            className="mt-2 min-h-24 rounded-xl border-transparent bg-inset text-sm leading-6 focus-visible:bg-surface focus-visible:ring-2"
          />
        ) : null}
      </div>
    </section>
  );
}

export default SizeRiskRail;

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Layers, Rocket } from 'lucide-react';
import { Button } from '@productmap/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@productmap/ui';
import type { PlanDiffItem } from './plan-diff';

export interface ScenarioBannerProps {
  planName: string;
  /** Compare pill — ghosts the CURRENT schedule beneath the scenario bars. */
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
  /** Client-computed apply preview (computePlanDiff) listed in the confirm dialog. */
  diff: PlanDiffItem[];
  onApply: () => void;
  applying?: boolean;
}

function fmtDate(d: string | null): string {
  return d ? format(parseISO(d), 'MMM d, yyyy') : 'unscheduled';
}

function fmtHorizon(h: string | null): string {
  return h ? h[0].toUpperCase() + h.slice(1) : '—';
}

/** One human-readable line per changed field. */
export function diffLines(item: PlanDiffItem): string[] {
  const lines: string[] = [];
  const { startDate, endDate, horizon } = item.fields;
  if (startDate || endDate) {
    const from = `${fmtDate(startDate?.from ?? null)} – ${fmtDate(endDate?.from ?? null)}`;
    const to = `${fmtDate(startDate?.to ?? null)} – ${fmtDate(endDate?.to ?? null)}`;
    lines.push(`Dates: ${from} → ${to}`);
  }
  if (horizon) lines.push(`Horizon: ${fmtHorizon(horizon.from)} → ${fmtHorizon(horizon.to)}`);
  return lines;
}

/**
 * Scenario-mode banner (dream tier 2 §6): names the draft being edited,
 * toggles ghost-compare, and applies the plan after a diff confirm.
 */
export function ScenarioBanner({
  planName,
  compare,
  onCompareChange,
  diff,
  onApply,
  applying,
}: ScenarioBannerProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div
      data-testid="scenario-banner"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-action-soft px-5 py-3"
    >
      <p className="text-sm font-medium text-action">
        Editing scenario '{planName}' — changes don't touch the real roadmap
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          data-testid="compare-toggle"
          aria-pressed={compare}
          onClick={() => onCompareChange(!compare)}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring ${
            compare
              ? 'border-transparent bg-card text-action shadow-sm-card'
              : 'border-action/30 text-action hover:bg-card/60'
          }`}
        >
          <Layers className="h-3.5 w-3.5" aria-hidden />
          Compare
        </button>
        <Button
          data-testid="apply-plan"
          size="sm"
          className="rounded-full"
          disabled={applying}
          onClick={() => setConfirmOpen(true)}
        >
          <Rocket className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Apply as current plan
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply '{planName}' to the roadmap?</DialogTitle>
            <DialogDescription>
              {diff.length === 0
                ? 'This plan matches the current roadmap — applying just marks it as the active plan.'
                : `${diff.length} feature${diff.length === 1 ? '' : 's'} will be rescheduled on the real roadmap.`}
            </DialogDescription>
          </DialogHeader>
          {diff.length > 0 && (
            <ul data-testid="apply-diff-list" className="max-h-72 space-y-3 overflow-y-auto">
              {diff.map((item) => (
                <li key={item.featureId} data-testid={`apply-diff-${item.featureId}`}>
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  {diffLines(item).map((line) => (
                    <p key={line} className="mt-0.5 text-xs text-muted-foreground">
                      {line}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              data-testid="apply-plan-confirm"
              className="rounded-full"
              disabled={applying}
              onClick={() => {
                setConfirmOpen(false);
                onApply();
              }}
            >
              Apply plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useRef, useState } from 'react';
import type { VoteSummary } from '@productmap/shared';
import { cn } from '@/lib/utils';
import { useVote, type VoteInput } from '@/lib/api';

interface VoteWidgetProps {
  featureId: string;
  summary: VoteSummary;
  /** compact = board cards; full = feature page header. */
  size?: 'compact' | 'full';
}

function formatScore(score: number) {
  if (score > 0) return `+${score}`;
  if (score < 0) return `−${Math.abs(score)}`;
  return '0';
}

/**
 * 🚀 Boost / 🧊 Cool pills with a net score chip between them.
 * Clicking my active vote clears it; clicking the other control flips it.
 */
export function VoteWidget({ featureId, summary, size = 'full' }: VoteWidgetProps) {
  const vote = useVote(featureId);
  const [popped, setPopped] = useState<'boost' | 'cool' | null>(null);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cast = (control: 'boost' | 'cool') => {
    const target: VoteInput = control === 'boost' ? 1 : -1;
    const next: VoteInput = summary.myVote === target ? 0 : target;
    setPopped(control);
    if (popTimer.current) clearTimeout(popTimer.current);
    popTimer.current = setTimeout(() => setPopped(null), 150);
    vote.mutate(next);
  };

  const compact = size === 'compact';
  const pill = cn(
    'inline-flex items-center gap-1 rounded-full font-medium tabular-nums',
    'transition-[background-color,color,transform] duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
  );

  return (
    <div
      className={cn('flex items-center', compact ? 'gap-1' : 'gap-1.5')}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="group"
      aria-label="Votes"
    >
      <button
        type="button"
        aria-label="Boost"
        aria-pressed={summary.myVote === 1}
        onClick={() => cast('boost')}
        className={cn(
          pill,
          summary.myVote === 1
            ? 'bg-[#dcebff] text-[#2b557e]'
            : 'bg-[#f0f3f7] text-muted-ink hover:bg-[#edf1f7]',
          popped === 'boost' && 'scale-[1.15]',
        )}
      >
        <span aria-hidden>🚀</span>
        {summary.boosts}
      </button>
      <span
        data-testid="vote-score"
        className={cn(
          'tabular-nums font-medium',
          compact ? 'px-0.5 text-xs' : 'px-1 text-sm',
          summary.score === 0 ? 'text-muted-ink' : 'text-ink',
        )}
      >
        {formatScore(summary.score)}
      </span>
      <button
        type="button"
        aria-label="Cool"
        aria-pressed={summary.myVote === -1}
        onClick={() => cast('cool')}
        className={cn(
          pill,
          summary.myVote === -1
            ? 'bg-[#d9f2f0] text-[#0e7490]'
            : 'bg-[#f0f3f7] text-muted-ink hover:bg-[#edf1f7]',
          popped === 'cool' && 'scale-[1.15]',
        )}
      >
        <span aria-hidden>🧊</span>
        {summary.cools}
      </button>
    </div>
  );
}

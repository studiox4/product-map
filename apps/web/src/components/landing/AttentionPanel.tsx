import { useNavigate } from 'react-router-dom';
import { CalendarX, Eye, FileQuestion, FileText, type LucideIcon } from 'lucide-react';
import type { AttentionItem } from '@productmap/shared';

const KIND_META: Record<AttentionItem['kind'], { icon: LucideIcon; label: string }> = {
  draft_doc: { icon: FileText, label: 'Draft doc' },
  in_review_doc: { icon: Eye, label: 'In review' },
  missing_dates: { icon: CalendarX, label: 'No dates' },
  no_docs: { icon: FileQuestion, label: 'No docs' },
};

export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  const navigate = useNavigate();

  function open(item: AttentionItem) {
    if (item.kind === 'draft_doc' || item.kind === 'in_review_doc') {
      navigate(`/docs/${item.documentId}`);
    } else {
      navigate(`/board?feature=${item.featureId}`);
    }
  }

  return (
    <section className="flex flex-col rounded-lg border border-t-2 border-t-slate-300 bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <h2 className="text-sm font-semibold">Needs attention</h2>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-2 pb-3">
        {items.length === 0 && (
          <p className="px-2 py-2 text-sm text-muted-foreground">All caught up</p>
        )}
        {items.map((item, i) => {
          const meta = KIND_META[item.kind];
          const Icon = meta.icon;
          return (
            <button
              key={`${item.kind}-${i}`}
              type="button"
              onClick={() => open(item)}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{item.title}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{meta.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default AttentionPanel;

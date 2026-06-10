import { useNavigate } from 'react-router-dom';
import { CalendarX, Eye, FileQuestion, FileText, MessageCircle, type LucideIcon } from 'lucide-react';
import type { AttentionItem } from '@productmap/shared';

const KIND_META: Record<
  AttentionItem['kind'],
  { icon: LucideIcon; label: string; chip: string }
> = {
  open_comments: { icon: MessageCircle, label: 'Open comments', chip: 'bg-[#e4f0e4] text-[#3c6b46]' },
  draft_doc: { icon: FileText, label: 'Draft doc', chip: 'bg-[#fdf0e3] text-[#9a6428]' },
  in_review_doc: { icon: Eye, label: 'In review', chip: 'bg-[#fbeedd] text-[#8a5a22]' },
  missing_dates: { icon: CalendarX, label: 'No dates', chip: 'bg-[#fcebe3] text-[#9a5a3c]' },
  no_docs: { icon: FileQuestion, label: 'No docs', chip: 'bg-[#f7efe2] text-[#86683a]' },
};

export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  const navigate = useNavigate();

  function open(item: AttentionItem) {
    if (item.kind === 'open_comments') {
      navigate(`/features/${item.featureId}#comments`);
    } else if (item.kind === 'draft_doc' || item.kind === 'in_review_doc') {
      navigate(`/docs/${item.documentId}`);
    } else {
      navigate(`/board?feature=${item.featureId}`);
    }
  }

  return (
    <section className="flex flex-col rounded-2xl border border-transparent bg-white shadow-card transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="font-display text-sm font-semibold text-ink">Needs attention</h2>
        <span className="inline-flex items-center rounded-full bg-[#fdf0e3] px-2 py-0.5 text-xs font-medium text-[#9a6428]">
          {items.length}
        </span>
      </div>
      <div className="flex max-h-72 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3">
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
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-body-ink outline-none transition-colors duration-150 ease-out hover:bg-[#edf1f7] focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meta.chip}`}
                aria-hidden
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="truncate">{item.title}</span>
              <span
                className={`ml-auto inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${meta.chip}`}
              >
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default AttentionPanel;

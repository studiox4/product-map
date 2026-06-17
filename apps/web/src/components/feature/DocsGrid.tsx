import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Plus } from 'lucide-react';
import { DOC_TYPE_COLORS, type FeatureWithDocs } from '@productmap/shared';
import { useAllDocuments } from '@/lib/api';
import { DocTypeChip } from '@/components/DocTypeChip';
import { StatusBadge } from '@/components/StatusBadge';
import { NewDocDialog } from '@/components/board/NewDocDialog';
import { appRoutes } from '@/lib/routes';

/** Card grid of the feature's docs: type-colored top edge, status, word count, updated. */
export function DocsGrid({ feature }: { feature: FeatureWithDocs }) {
  const navigate = useNavigate();
  const { data: allDocs } = useAllDocuments();
  const [newDocOpen, setNewDocOpen] = useState(false);
  const newDocTriggerRef = useRef<HTMLButtonElement>(null);

  const wordCounts = new Map(
    (allDocs ?? []).filter((d) => d.featureId === feature.id).map((d) => [d.id, d.wordCount]),
  );

  return (
    <section aria-label="Docs">
      <h2 className="font-display text-sm font-semibold text-ink">Docs</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {feature.documents.map((doc) => {
          const words = wordCounts.get(doc.id);
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => navigate(appRoutes.doc(doc.id))}
              className="overflow-hidden rounded-xl bg-surface text-left shadow-card transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className="block h-1"
                style={{ backgroundColor: DOC_TYPE_COLORS[doc.type].edge }}
              />
              <span className="block space-y-2 p-4">
                <DocTypeChip type={doc.type} />
                <span className="block truncate font-display text-sm font-semibold text-ink">
                  {doc.title}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-ink">
                  <StatusBadge status={doc.status} />
                  {typeof words === 'number' ? <span>{words} words</span> : null}
                  <span>
                    Updated {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
        <button
          ref={newDocTriggerRef}
          type="button"
          onClick={() => setNewDocOpen(true)}
          className="flex min-h-28 items-center justify-center gap-2 rounded-xl border border-dashed border-line-dash text-sm font-medium text-muted-ink transition-colors duration-150 ease-out hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New doc
        </button>
      </div>

      <NewDocDialog
        feature={feature}
        open={newDocOpen}
        onOpenChange={setNewDocOpen}
        returnFocusRef={newDocTriggerRef}
      />
    </section>
  );
}

export default DocsGrid;

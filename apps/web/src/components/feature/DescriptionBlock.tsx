import { useMemo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';
import type { FeatureWithDocs } from '@productmap/shared';
import { useUpdateFeature } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const proseClass =
  'space-y-3 text-sm leading-6 text-body-ink ' +
  '[&_h1]:font-display [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-ink ' +
  '[&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink ' +
  '[&_h3]:font-display [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink ' +
  '[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 ' +
  '[&_a]:text-action [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[#c9d3df] [&_blockquote]:pl-3 ' +
  '[&_code]:rounded [&_code]:bg-[#f0f3f7] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs';

/** Soft-wash card with markdown-lite description editing (textarea ⇄ rendered markdown). */
export function DescriptionBlock({ feature }: { feature: FeatureWithDocs }) {
  const updateFeature = useUpdateFeature();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(feature.descriptionMd);

  const html = useMemo(
    () =>
      feature.descriptionMd
        ? DOMPurify.sanitize(marked.parse(feature.descriptionMd, { async: false }) as string)
        : '',
    [feature.descriptionMd],
  );

  const startEditing = () => {
    setDraft(feature.descriptionMd);
    setEditing(true);
  };

  const save = () => {
    setEditing(false);
    if (draft === feature.descriptionMd) return;
    updateFeature.mutate(
      { id: feature.id, descriptionMd: draft },
      { onError: () => toast.error(`Couldn't save description for '${feature.title}' — restored`) },
    );
  };

  return (
    <section className="rounded-2xl bg-[#f6f8fb] p-6" aria-label="Description">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-ink">Description</h2>
        {!editing ? (
          <Button variant="ghost" size="sm" className="rounded-full" onClick={startEditing}>
            Edit
          </Button>
        ) : null}
      </div>
      <div className="mt-3">
        {editing ? (
          <Textarea
            autoFocus
            aria-label="Feature description"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            placeholder="Write a short description — markdown works…"
            className="min-h-32 rounded-xl border-transparent bg-white text-sm leading-6 focus-visible:ring-2"
          />
        ) : feature.descriptionMd ? (
          // eslint-disable-next-line react/no-danger -- sanitized via DOMPurify above
          <div className={proseClass} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="w-full rounded-xl border border-dashed border-[#c9d3df] px-3 py-6 text-center text-sm text-muted-ink transition-colors duration-150 ease-out hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Add a description…
          </button>
        )}
      </div>
    </section>
  );
}

export default DescriptionBlock;

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Info, Loader2, Check, AlertCircle } from 'lucide-react';
import type { Template } from '@productmap/shared';
import { useTemplates, useUpdateTemplate, apiErrorMessage } from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { DocTypeChip } from '@/components/DocTypeChip';
import { Editor } from '@/components/editor/Editor';
import { useAutosave, type AutosaveState } from '@/components/editor/useAutosave';
import { Button } from '@productmap/ui';
import { Input } from '@productmap/ui';
import { Label } from '@productmap/ui';
import { Textarea } from '@productmap/ui';
import { Skeleton } from '@productmap/ui';

function SaveIndicator({ state }: { state: AutosaveState }) {
  if (state === 'idle') return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-ink"
      role="status"
    >
      {state === 'saving' ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Saving…
        </>
      ) : state === 'saved' ? (
        <>
          <Check className="h-3 w-3 text-sage" aria-hidden="true" /> Saved
        </>
      ) : (
        <>
          <AlertCircle className="h-3 w-3 text-destructive" aria-hidden="true" />
          Retrying…
        </>
      )}
    </span>
  );
}

function TemplateEditorSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[860px] space-y-4 px-4 pb-16 pt-6 sm:px-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  );
}

function TemplateChrome({ template }: { template: Template }) {
  const updateTemplate = useUpdateTemplate();
  const { mutateAsync: patchTemplate, mutate: patchFireAndForget } = updateTemplate;

  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [promptHints, setPromptHints] = useState(template.promptHints);

  // Field saves: fire on blur when changed (autosave handles the body).
  const saveField = useCallback(
    (patch: { name?: string; description?: string; promptHints?: string }) => {
      patchFireAndForget(
        { id: template.id, ...patch },
        {
          onError: (err) =>
            toast.error(apiErrorMessage(err, "Couldn't save the template")),
        },
      );
    },
    [patchFireAndForget, template.id],
  );

  const saveBody = useCallback(
    async (bodyJson: Record<string, unknown>) => {
      await patchTemplate({ id: template.id, bodyJson });
    },
    [patchTemplate, template.id],
  );
  const autosave = useAutosave(saveBody);
  const { schedule, flush } = autosave;

  // Flush any pending body save when leaving the page.
  useEffect(() => () => void flush(), [flush]);

  const handleEditorChange = useCallback(
    (json: Record<string, unknown>) => schedule(json),
    [schedule],
  );

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 pb-16 pt-6 sm:px-6">
      <div className="flex items-center gap-3 rounded-full bg-surface px-5 py-3 shadow-card">
        <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-ink">
          <Link to={appRoutes.settings}>
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            Settings
          </Link>
        </Button>
        <DocTypeChip type={template.type} />
        <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-ink">
          {name || 'Untitled template'}
        </span>
        <SaveIndicator state={autosave.state} />
      </div>

      <div className="mt-6 space-y-4 rounded-2xl bg-surface p-6 shadow-card">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const trimmed = name.trim();
                if (trimmed && trimmed !== template.name) saveField({ name: trimmed });
                else setName(template.name);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-description">Description</Label>
            <Input
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (description !== template.description)
                  saveField({ description });
              }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="template-prompt-hints">AI drafting hints</Label>
          <Textarea
            id="template-prompt-hints"
            value={promptHints}
            onChange={(e) => setPromptHints(e.target.value)}
            onBlur={() => {
              if (promptHints !== template.promptHints)
                saveField({ promptHints });
            }}
            rows={3}
            placeholder="Guidance the AI uses when drafting documents of this type."
          />
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-wash px-4 py-3 text-sm text-body-ink">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-action" aria-hidden="true" />
        <p>
          Use <code className="rounded bg-surface px-1 py-0.5 text-xs">{'{{title}}'}</code>{' '}
          where the document title should appear.
        </p>
      </div>

      <Editor
        key={template.id}
        initialContent={template.bodyJson}
        onChange={handleEditorChange}
        uploadImage={async (file) => {
          const fd = new FormData();
          fd.append('file', file);
          const res = await fetch('/api/uploads', { method: 'POST', body: fd });
          if (!res.ok) throw new Error(`upload failed (${res.status})`);
          const { url } = (await res.json()) as { url: string };
          return url;
        }}
        aiEnabled={false}
      />
    </div>
  );
}

/** /settings/templates/:id — Tiptap editing for a DB template with template chrome. */
export default function TemplateEditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  // No GET /api/templates/:id — resolve from the full list (archived included so deep links keep working).
  const templatesQuery = useTemplates({ includeArchived: true });

  if (templatesQuery.isLoading) return <TemplateEditorSkeleton />;

  const template = templatesQuery.data?.find((t) => t.id === id);

  if (templatesQuery.isError || !template) {
    return (
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <div className="rounded-2xl border border-transparent bg-surface p-6 shadow-card">
          <p className="text-sm text-body-ink">Couldn't load this template.</p>
          <Button asChild className="mt-4" variant="outline">
            <Link to={appRoutes.settings}>Back to settings</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <TemplateChrome key={template.id} template={template} />;
}

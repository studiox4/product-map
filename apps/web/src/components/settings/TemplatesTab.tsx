import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { MoreHorizontal, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { DOC_TYPES, type DocType, type Template } from '@productmap/shared';
import {
  apiErrorMessage,
  useArchiveTemplate,
  useCreateTemplate,
  useDuplicateTemplate,
  useSetDefaultTemplate,
  useTemplates,
} from '@/lib/api';
import { appRoutes } from '@/lib/routes';
import { DocTypeChip } from '@/components/DocTypeChip';
import { Button } from '@productmap/ui';
import { Input } from '@productmap/ui';
import { Skeleton } from '@productmap/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@productmap/ui';

function DefaultPill() {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-sage-soft px-2 py-0.5 text-xs font-medium text-sage">
      Default
    </span>
  );
}

function TemplateRow({
  template,
  onEdit,
}: {
  template: Template;
  onEdit: (id: string) => void;
}) {
  const duplicate = useDuplicateTemplate();
  const setDefault = useSetDefaultTemplate();
  const archive = useArchiveTemplate();

  const handleArchive = () => {
    archive.mutate(
      { id: template.id, archived: true },
      {
        onError: (err) =>
          toast.error(
            apiErrorMessage(err, `Couldn't archive '${template.name}'`),
          ),
      },
    );
  };

  return (
    <li
      data-testid="template-row"
      className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(template.id)}
            className="truncate text-left text-sm font-medium text-ink hover:underline"
          >
            {template.name}
          </button>
          {template.isDefault ? <DefaultPill /> : null}
        </div>
        {template.description ? (
          <p className="mt-0.5 truncate text-xs text-muted-ink">
            {template.description}
          </p>
        ) : null}
      </div>
      <span className="hidden shrink-0 text-xs text-muted-ink sm:block">
        {formatDistanceToNow(new Date(template.updatedAt), { addSuffix: true })}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-ink"
            aria-label={`Actions for ${template.name}`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEdit(template.id)}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              duplicate.mutate(template.id, {
                onError: () =>
                  toast.error(`Couldn't duplicate '${template.name}'`),
              })
            }
          >
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={template.isDefault}
            onSelect={() =>
              setDefault.mutate(template.id, {
                onError: (err) =>
                  toast.error(
                    apiErrorMessage(err, `Couldn't set '${template.name}' as default`),
                  ),
              })
            }
          >
            Set default
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleArchive}>Archive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function NewTemplateInline({ type }: { type: DocType }) {
  const navigate = useNavigate();
  const create = useCreateTemplate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { type, name: trimmed },
      {
        onSuccess: (tpl) => navigate(appRoutes.templateEditor(tpl.id)),
        onError: () => toast.error(`Couldn't create '${trimmed}'`),
      },
    );
  };

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-ink"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
        New template
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name"
        aria-label={`New ${type} template name`}
        className="h-8 w-56"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setName('');
          }
        }}
      />
      <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
        Create
      </Button>
    </form>
  );
}

/** Templates tab of /settings — grouped per doc type, archived collapsed under a toggle. */
export function TemplatesTab() {
  const navigate = useNavigate();
  const templatesQuery = useTemplates({ includeArchived: true });
  const restore = useArchiveTemplate();
  const [showArchived, setShowArchived] = useState(false);

  const { groups, archived } = useMemo(() => {
    const all = templatesQuery.data ?? [];
    const active = all.filter((t) => t.archivedAt === null);
    return {
      groups: DOC_TYPES.map((type) => ({
        type,
        templates: active.filter((t) => t.type === type),
      })),
      archived: all.filter((t) => t.archivedAt !== null),
    };
  }, [templatesQuery.data]);

  const onEdit = (id: string) => navigate(appRoutes.templateEditor(id));

  if (templatesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    );
  }

  if (templatesQuery.isError) {
    return (
      <div className="rounded-2xl border border-transparent bg-surface p-6 shadow-card">
        <p className="text-sm text-body-ink">Couldn't load templates.</p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => void templatesQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map(({ type, templates }) => (
        <section key={type} aria-label={`${type} templates`}>
          <header className="mb-3 flex items-center gap-2">
            <DocTypeChip type={type} />
            <span className="text-xs text-muted-ink" data-testid={`count-${type}`}>
              {templates.length}
            </span>
          </header>
          <ul className="space-y-2">
            {templates.map((t) => (
              <TemplateRow key={t.id} template={t} onEdit={onEdit} />
            ))}
          </ul>
          <div className="mt-2">
            <NewTemplateInline type={type} />
          </div>
        </section>
      ))}

      <section aria-label="archived templates">
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted-ink hover:text-ink"
          onClick={() => setShowArchived((v) => !v)}
          aria-expanded={showArchived}
        >
          {showArchived ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
          Archived ({archived.length})
        </button>
        {showArchived ? (
          <ul className="mt-3 space-y-2">
            {archived.map((t) => (
              <li
                key={t.id}
                data-testid="archived-template-row"
                className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-wash px-4 py-3 opacity-80"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">
                      {t.name}
                    </span>
                    <DocTypeChip type={t.type} />
                  </div>
                  {t.description ? (
                    <p className="mt-0.5 truncate text-xs text-muted-ink">
                      {t.description}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    restore.mutate(
                      { id: t.id, archived: false },
                      {
                        onError: (err) =>
                          toast.error(
                            apiErrorMessage(err, `Couldn't restore '${t.name}'`),
                          ),
                      },
                    )
                  }
                >
                  Restore
                </Button>
              </li>
            ))}
            {archived.length === 0 ? (
              <li className="text-sm text-muted-ink">No archived templates.</li>
            ) : null}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

export default TemplatesTab;

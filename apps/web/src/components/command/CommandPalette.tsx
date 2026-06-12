import { useMemo, useState } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Clock,
  Columns3,
  CornerDownLeft,
  FileText,
  GanttChart,
  LayoutDashboard,
  Library,
  MessageCircle,
  Monitor,
  Moon,
  PackageCheck,
  Plus,
  Puzzle,
  Download,
  Rocket,
  Settings,
  Sun,
  Target,
} from 'lucide-react';
import {
  DOC_TYPE_LABELS,
  HORIZONS,
  type FeatureWithDocs,
  type Horizon,
} from '@productmap/shared';
import {
  useAllDocuments,
  useCreateFeature,
  useFeatures,
  useUpdateFeature,
  useVote,
} from '@/lib/api';
import { setTheme, type Theme } from '@/lib/theme';
import { navigateWithTransition } from '@/lib/transitions';
import { HORIZON_LABELS } from '@/components/HorizonBadge';
import { NewDocDialog } from '@/components/board/NewDocDialog';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { getRecents, recordRecent } from './recents';
import { TOGGLE_COMMENTS_EVENT } from './useGlobalShortcuts';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Page = { kind: 'create-feature'; horizon: Horizon } | { kind: 'new-doc' };

const NAV_TARGETS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/board', label: 'Board', icon: Columns3 },
  { to: '/roadmap', label: 'Roadmap', icon: GanttChart },
  { to: '/releases', label: 'Releases', icon: Rocket },
  { to: '/outcomes', label: 'Outcomes', icon: Target },
  { to: '/docs', label: 'Docs', icon: Library },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const THEME_OPTIONS: { theme: Theme; label: string; icon: typeof Sun }[] = [
  { theme: 'light', label: 'Switch to light theme', icon: Sun },
  { theme: 'dark', label: 'Switch to dark theme', icon: Moon },
  { theme: 'system', label: 'Switch to system theme', icon: Monitor },
];

/**
 * ⌘K command palette (spec 1.2): navigate, create, context actions, theme,
 * recents. Mounted once in AppShell; content (and its queries) only exist
 * while the dialog is open.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  // Lives outside the dialog so the doc flow survives the palette closing.
  const [docFeature, setDocFeature] = useState<FeatureWithDocs | null>(null);

  return (
    <>
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <PaletteContent
          close={() => onOpenChange(false)}
          onPickDocFeature={(feature) => {
            onOpenChange(false);
            setDocFeature(feature);
          }}
        />
      </CommandDialog>
      {docFeature ? (
        <NewDocDialog
          feature={docFeature}
          open
          onOpenChange={(o) => {
            if (!o) setDocFeature(null);
          }}
        />
      ) : null}
    </>
  );
}

function PaletteContent({
  close,
  onPickDocFeature,
}: {
  close: () => void;
  onPickDocFeature: (feature: FeatureWithDocs) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<Page | null>(null);

  const features = useFeatures().data ?? [];
  const docs = useAllDocuments().data ?? [];
  const createFeature = useCreateFeature();
  const updateFeature = useUpdateFeature();

  // ---- context (feature page, board peek, doc editor) ----
  const featureMatch = matchPath('/features/:id', location.pathname);
  const peekId =
    location.pathname === '/board'
      ? new URLSearchParams(location.search).get('feature')
      : null;
  const contextFeatureId = featureMatch?.params.id ?? peekId ?? null;
  const contextFeature = contextFeatureId
    ? (features.find((f) => f.id === contextFeatureId) ?? null)
    : null;
  const contextDocId = matchPath('/docs/:id', location.pathname)?.params.id ?? null;
  const vote = useVote(contextFeatureId ?? '');

  // Drop recents whose target no longer exists (e.g. ids from before a db reset).
  const recents = useMemo(() => {
    const known = new Set([...features.map((f) => f.id), ...docs.map((d) => d.id)]);
    const live = getRecents().filter((e) => known.has(e.id));
    return features.length || docs.length ? live : getRecents();
  }, [features, docs]);

  const go = (to: string) => {
    close();
    navigateWithTransition(() => navigate(to));
  };

  const openPage = (next: Page) => {
    setPage(next);
    setSearch('');
  };

  const submitCreateFeature = (horizon: Horizon) => {
    const title = search.trim();
    if (!title || createFeature.isPending) return;
    createFeature.mutate(
      { title, horizon },
      {
        onSuccess: (feature) => {
          recordRecent({ kind: 'feature', id: feature.id, title: feature.title });
          go(`/features/${feature.id}`);
        },
        onError: () => toast.error(`Couldn't create '${title}'`),
      },
    );
  };

  const patchContextFeature = (
    patch: { horizon: Horizon } | { status: 'shipped' },
    errorLabel: string,
  ) => {
    if (!contextFeature) return;
    updateFeature.mutate(
      { id: contextFeature.id, ...patch },
      { onError: () => toast.error(`Couldn't ${errorLabel} '${contextFeature.title}' — restored`) },
    );
    close();
  };

  const castVote = (value: 1 | -1) => {
    if (!contextFeature) return;
    vote.mutate(contextFeature.myVote === value ? 0 : value);
    close();
  };

  const exportMarkdown = () => {
    if (!contextDocId) return;
    const a = document.createElement('a');
    a.href = `/api/documents/${contextDocId}/export.md`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    close();
  };

  const placeholder =
    page?.kind === 'create-feature'
      ? `Feature title — created in ${HORIZON_LABELS[page.horizon]}…`
      : page?.kind === 'new-doc'
        ? 'Which feature is this doc for?'
        : 'Type a command or search…';

  return (
    <>
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && search === '' && page) {
            e.preventDefault();
            setPage(null);
          }
        }}
      />
      <CommandList>
        {page?.kind === 'create-feature' ? (
          <CommandGroup heading={`New feature in ${HORIZON_LABELS[page.horizon]}`}>
            <CommandItem
              value="-create-feature-submit"
              disabled={!search.trim() || createFeature.isPending}
              forceMount
              onSelect={() => submitCreateFeature(page.horizon)}
            >
              <Plus aria-hidden />
              <span className="truncate">
                Create '{search.trim() || '…'}' in {HORIZON_LABELS[page.horizon]}
              </span>
              <CornerDownLeft className="ml-auto" aria-hidden />
            </CommandItem>
          </CommandGroup>
        ) : page?.kind === 'new-doc' ? (
          <>
            <CommandEmpty>No matching feature.</CommandEmpty>
            <CommandGroup heading="New doc — pick a feature">
              {features.map((feature) => (
                <CommandItem
                  key={feature.id}
                  value={`new-doc-${feature.id} ${feature.title}`}
                  onSelect={() => onPickDocFeature(feature)}
                >
                  <Puzzle aria-hidden />
                  <span className="truncate">{feature.title}</span>
                  <span className="ml-auto text-xs text-muted-ink">
                    {HORIZON_LABELS[feature.horizon]}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : (
          <>
            <CommandEmpty>No results.</CommandEmpty>

            {recents.length > 0 ? (
              <>
                <CommandGroup heading="Recents">
                  {recents.map((entry) => (
                    <CommandItem
                      key={`${entry.kind}-${entry.id}`}
                      value={`recent-${entry.kind}-${entry.id} ${entry.title}`}
                      onSelect={() =>
                        go(entry.kind === 'feature' ? `/features/${entry.id}` : `/docs/${entry.id}`)
                      }
                    >
                      <Clock aria-hidden />
                      <span className="truncate">{entry.title}</span>
                      <span className="ml-auto text-xs text-muted-ink">
                        {entry.kind === 'feature' ? 'Feature' : 'Doc'}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}

            {(contextFeature || contextDocId) && (
              <>
                <CommandGroup heading="Actions">
                  {contextFeature ? (
                    <>
                      {HORIZONS.filter((h) => h !== contextFeature.horizon).map((horizon) => (
                        <CommandItem
                          key={horizon}
                          value={`action-move-${horizon} move to ${HORIZON_LABELS[horizon]}`}
                          onSelect={() => patchContextFeature({ horizon }, 'move')}
                        >
                          <Columns3 aria-hidden />
                          Move to {HORIZON_LABELS[horizon]}
                        </CommandItem>
                      ))}
                      {contextFeature.status !== 'shipped' ? (
                        <CommandItem
                          value="action-mark-shipped mark shipped"
                          onSelect={() => patchContextFeature({ status: 'shipped' }, 'update')}
                        >
                          <PackageCheck aria-hidden />
                          Mark shipped
                        </CommandItem>
                      ) : null}
                      <CommandItem value="action-boost 🚀 boost vote" onSelect={() => castVote(1)}>
                        <span aria-hidden>🚀</span>
                        Boost
                      </CommandItem>
                      <CommandItem value="action-cool 🧊 cool vote" onSelect={() => castVote(-1)}>
                        <span aria-hidden>🧊</span>
                        Cool
                      </CommandItem>
                    </>
                  ) : null}
                  {contextDocId ? (
                    <>
                      <CommandItem value="action-export markdown export" onSelect={exportMarkdown}>
                        <Download aria-hidden />
                        Export markdown
                      </CommandItem>
                      <CommandItem
                        value="action-toggle-comments toggle comments"
                        onSelect={() => {
                          window.dispatchEvent(new CustomEvent(TOGGLE_COMMENTS_EVENT));
                          close();
                        }}
                      >
                        <MessageCircle aria-hidden />
                        Toggle comments
                      </CommandItem>
                    </>
                  ) : null}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            <CommandGroup heading="Navigate">
              {NAV_TARGETS.map(({ to, label, icon: Icon }) => (
                <CommandItem key={to} value={`nav-${label} go to ${label}`} onSelect={() => go(to)}>
                  <Icon aria-hidden />
                  {label}
                </CommandItem>
              ))}
              {features.map((feature) => (
                <CommandItem
                  key={feature.id}
                  value={`feature-${feature.id} ${feature.title}`}
                  onSelect={() => go(`/features/${feature.id}`)}
                >
                  <Puzzle aria-hidden />
                  <span className="truncate">Feature: {feature.title}</span>
                  <span className="ml-auto text-xs text-muted-ink">
                    {HORIZON_LABELS[feature.horizon]}
                  </span>
                </CommandItem>
              ))}
              {docs.map((doc) => (
                <CommandItem
                  key={doc.id}
                  value={`doc-${doc.id} ${doc.title} ${DOC_TYPE_LABELS[doc.type]}`}
                  onSelect={() => go(`/docs/${doc.id}`)}
                >
                  <FileText aria-hidden />
                  <span className="truncate">
                    Doc: {doc.title} — {DOC_TYPE_LABELS[doc.type]}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />

            <CommandGroup heading="Create">
              {HORIZONS.map((horizon) => (
                <CommandItem
                  key={horizon}
                  value={`create-feature-${horizon} new feature in ${HORIZON_LABELS[horizon]}`}
                  onSelect={() => openPage({ kind: 'create-feature', horizon })}
                >
                  <Plus aria-hidden />
                  New feature in {HORIZON_LABELS[horizon]}…
                </CommandItem>
              ))}
              <CommandItem
                value="create-doc new doc"
                onSelect={() => openPage({ kind: 'new-doc' })}
              >
                <FileText aria-hidden />
                New doc…
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />

            <CommandGroup heading="Theme">
              {THEME_OPTIONS.map(({ theme, label, icon: Icon }) => (
                <CommandItem
                  key={theme}
                  value={`theme-${theme} ${label}`}
                  onSelect={() => {
                    setTheme(theme);
                    close();
                  }}
                >
                  <Icon aria-hidden />
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </>
  );
}

export default CommandPalette;

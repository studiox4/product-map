import { useEffect } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { hashKey } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api';
import { useProjectId } from '@/lib/project';

export type RecentKind = 'feature' | 'doc';

export interface RecentEntry {
  kind: RecentKind;
  id: string;
  title: string;
}

export const RECENTS_KEY = 'pmRecents';
export const MAX_RECENTS = 5;

/** Last-visited features/docs, most recent first (max 5). */
export function getRecents(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentEntry =>
          typeof e === 'object' &&
          e !== null &&
          ((e as RecentEntry).kind === 'feature' || (e as RecentEntry).kind === 'doc') &&
          typeof (e as RecentEntry).id === 'string' &&
          typeof (e as RecentEntry).title === 'string',
      )
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

/** Push an entry to the front, deduping by kind+id, capped at 5. */
export function recordRecent(entry: RecentEntry): void {
  try {
    const next = [
      entry,
      ...getRecents().filter((e) => !(e.kind === entry.kind && e.id === entry.id)),
    ].slice(0, MAX_RECENTS);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // private mode etc. — recents just won't persist
  }
}

/**
 * Record visited features/docs as the user navigates. The title is read from
 * the detail query cache (those queries are already active on the visited
 * page, so this never triggers a fetch of its own).
 */
export function useTrackRecents(): void {
  const pid = useProjectId();
  const location = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    const featureMatch = matchPath('/features/:id', location.pathname);
    const docMatch = matchPath('/docs/:id', location.pathname);
    const target = featureMatch?.params.id
      ? { kind: 'feature' as const, id: featureMatch.params.id, key: queryKeys.feature(pid, featureMatch.params.id) }
      : docMatch?.params.id
        ? { kind: 'doc' as const, id: docMatch.params.id, key: queryKeys.document(pid, docMatch.params.id) }
        : null;
    if (!target) return;

    const tryRecord = () => {
      const data = qc.getQueryData<{ title?: string }>(target.key);
      if (typeof data?.title === 'string' && data.title) {
        recordRecent({ kind: target.kind, id: target.id, title: data.title });
        return true;
      }
      return false;
    };

    if (tryRecord()) return;
    const targetHash = hashKey(target.key);
    const unsubscribe = qc.getQueryCache().subscribe((event) => {
      if (event.query.queryHash !== targetHash) return;
      if (tryRecord()) unsubscribe();
    });
    return unsubscribe;
  }, [location.pathname, pid, qc]);
}

import { hc } from 'hono/client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useProjectId } from './project';
import type {
  ActivityItem,
  Comment,
  CommentThread,
  DashboardResponse,
  DocStatus,
  DocType,
  DocumentFull,
  DocumentListItem,
  DocumentMeta,
  Feature,
  FeatureStatus,
  FeatureWithDocs,
  Horizon,
  OverviewResponse,
  Project,
  User,
} from '@productmap/shared';
import type { AppType } from '../../../api/src/app';

/** Typed hono client for the API (same-origin; Vite proxies /api in dev). */
export const api = hc<AppType>('/');

/** Build a project-scoped API path: apiPath(pid, 'features', id) → /api/projects/<pid>/features/<id>. */
export function apiPath(projectId: string, ...segments: (string | number)[]): string {
  return `/api/projects/${projectId}${segments.length ? '/' + segments.join('/') : ''}`;
}

// ---- request body types (mirror @productmap/shared zod schemas) ----

export interface FeatureCreateInput {
  title: string;
  horizon: Horizon;
}
export interface FeatureUpdateInput {
  title?: string;
  horizon?: Horizon;
  status?: FeatureStatus;
  startDate?: string | null;
  endDate?: string | null;
  sortOrder?: number;
  descriptionMd?: string;
}
export interface UserCreateInput {
  name: string;
}
export interface DocumentCreateInput {
  featureId: string;
  type: DocType;
  title: string;
  fromTemplate?: boolean;
  /** Explicit DB template; omitted → the type's default (when fromTemplate). */
  templateId?: string;
}
export interface DocumentUpdateInput {
  title?: string;
  contentJson?: unknown;
  status?: DocStatus;
  /** Curated gradient cover key; null clears the cover. */
  cover?: string | null;
}
export interface ProjectUpdateInput {
  name?: string;
  slug?: string;
  vision?: string;
  aboutMd?: string;
}
export interface AiStatus {
  enabled: boolean;
}

// ---- fetch helpers ----

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

// Late-bound fetch so demo mode can route all API I/O through the in-page
// demo backend (apps/web/src/demo). Production leaves this as the global fetch.
let activeFetch: typeof fetch = (...args) => fetch(...args);
export function setActiveFetch(f: typeof fetch): void { activeFetch = f; }

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = activeFetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((r) => r.ok)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const doFetch = () => activeFetch(input, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  let res = await doFetch();
  if (res.status === 401 && !input.startsWith('/api/auth/')) {
    if (await tryRefresh()) res = await doFetch();
  }
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* non-json */ }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- query keys ----

export const queryKeys = {
  /** pid-keyed, nested path. */
  overview: (pid: string) => ['p', pid, 'overview'] as const,
  features: (pid: string) => ['p', pid, 'features'] as const,
  feature: (pid: string, id: string) => ['p', pid, 'features', id] as const,
  document: (pid: string, id: string) => ['p', pid, 'documents', id] as const,
  allDocuments: (pid: string) => ['p', pid, 'documents', 'all'] as const,
  users: ['users'] as const,
  activity: (pid: string, featureId: string) => ['p', pid, 'features', featureId, 'activity'] as const,
  workspaceActivity: (pid: string) => ['p', pid, 'activity', 'workspace'] as const,
  aiStatus: ['ai', 'status'] as const,
  /** User-scoped (NOT pid-keyed) — the cross-project dashboard spans projects. */
  dashboard: ['dashboard'] as const,
};

// ---- queries ----

export function useOverview() {
  const pid = useProjectId();
  return useQuery({
    queryKey: queryKeys.overview(pid),
    queryFn: () => fetchJson<OverviewResponse>(apiPath(pid, 'overview')),
  });
}

/** User-scoped cross-project dashboard (NOT pid-keyed — it spans projects). */
export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => fetchJson<DashboardResponse>('/api/dashboard'),
    staleTime: 30_000,
  });
}

/**
 * Toggle a per-user project favorite. Optimistically flips the flag in the
 * dashboard cache and re-sorts (favorites first), rolling back on error.
 */
export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, favorite }: { projectId: string; favorite: boolean }) =>
      fetchJson<{ favorite: boolean }>(`/api/projects/${projectId}/favorite`, {
        method: favorite ? 'POST' : 'DELETE',
      }),
    onMutate: async ({ projectId, favorite }) => {
      await qc.cancelQueries({ queryKey: queryKeys.dashboard });
      const prev = qc.getQueryData<DashboardResponse>(queryKeys.dashboard);
      if (prev) {
        qc.setQueryData<DashboardResponse>(queryKeys.dashboard, {
          ...prev,
          projects: prev.projects
            .map((p) => (p.id === projectId ? { ...p, favorite } : p))
            .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.dashboard, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.dashboard }),
  });
}

export function useFeatures() {
  const pid = useProjectId();
  return useQuery({
    queryKey: queryKeys.features(pid),
    queryFn: () => fetchJson<FeatureWithDocs[]>(apiPath(pid, 'features')),
  });
}

export function useFeature(id: string) {
  const pid = useProjectId();
  return useQuery({
    queryKey: queryKeys.feature(pid, id),
    queryFn: () => fetchJson<FeatureWithDocs>(apiPath(pid, 'features', id)),
    enabled: !!id,
  });
}

export function useDocument(id: string) {
  const pid = useProjectId();
  return useQuery({
    queryKey: queryKeys.document(pid, id),
    queryFn: () => fetchJson<DocumentFull>(apiPath(pid, 'documents', id)),
    enabled: !!id,
  });
}

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => fetchJson<User[]>('/api/users'),
  });
}

/** Current authenticated user. Returns null when logged out (401); does NOT trigger the refresh interceptor. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<User | null> => {
      const res = await activeFetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) return null;
      if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
      return (await res.json()) as User;
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useActivity(featureId: string) {
  const pid = useProjectId();
  return useQuery({
    queryKey: queryKeys.activity(pid, featureId),
    queryFn: () => fetchJson<ActivityItem[]>(apiPath(pid, 'features', featureId, 'activity')),
    enabled: !!featureId,
  });
}

export function useAllDocuments() {
  const pid = useProjectId();
  return useQuery({
    queryKey: queryKeys.allDocuments(pid),
    queryFn: () => fetchJson<DocumentListItem[]>(apiPath(pid, 'documents') + '?all=true'),
  });
}

export function useAiStatus() {
  return useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: () => fetchJson<AiStatus>('/api/ai/status'),
    staleTime: Infinity,
  });
}

// ---- mutations ----

function patchFeatureInCaches(
  qc: QueryClient,
  pid: string,
  id: string,
  patch: FeatureUpdateInput,
) {
  qc.setQueryData<FeatureWithDocs[]>(queryKeys.features(pid), (old) =>
    old?.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  );
  qc.setQueryData<FeatureWithDocs>(queryKeys.feature(pid, id), (old) =>
    old ? { ...old, ...patch } : old,
  );
  qc.setQueryData<OverviewResponse>(queryKeys.overview(pid), (old) =>
    old
      ? {
          ...old,
          features: old.features.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        }
      : old,
  );
}

export interface UpdateFeatureVars extends FeatureUpdateInput {
  id: string;
}

/** Optimistic feature PATCH: cancels in-flight queries, snapshots caches, rolls back on error, invalidates on settle. */
export function useUpdateFeature() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateFeatureVars) =>
      fetchJson<Feature>(apiPath(pid, 'features', id), {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onMutate: async ({ id, ...patch }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.features(pid) }),
        qc.cancelQueries({ queryKey: queryKeys.overview(pid) }),
      ]);
      const snapshot = {
        features: qc.getQueryData<FeatureWithDocs[]>(queryKeys.features(pid)),
        feature: qc.getQueryData<FeatureWithDocs>(queryKeys.feature(pid, id)),
        overview: qc.getQueryData<OverviewResponse>(queryKeys.overview(pid)),
      };
      patchFeatureInCaches(qc, pid, id, patch);
      return snapshot;
    },
    onError: (_err, { id }, snapshot) => {
      if (!snapshot) return;
      qc.setQueryData(queryKeys.features(pid), snapshot.features);
      qc.setQueryData(queryKeys.feature(pid, id), snapshot.feature);
      qc.setQueryData(queryKeys.overview(pid), snapshot.overview);
    },
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.features(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.feature(pid, id) });
      qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
    },
  });
}

export function useCreateFeature() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FeatureCreateInput) =>
      fetchJson<Feature>(apiPath(pid, 'features'), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.features(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
    },
  });
}

export function useDeleteFeature() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<void>(apiPath(pid, 'features', id), { method: 'DELETE' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.features(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
    },
  });
}

export interface UpdateDocumentVars extends DocumentUpdateInput {
  id: string;
}

export function useUpdateDocument() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateDocumentVars) =>
      fetchJson<DocumentMeta>(apiPath(pid, 'documents', id), {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (meta, { id, contentJson }) => {
      // Merge server meta into the cached full document without clobbering
      // the editor's local contentJson (avoids re-render churn while typing).
      qc.setQueryData<DocumentFull>(queryKeys.document(pid, id), (old) =>
        old
          ? { ...old, ...meta, ...(contentJson !== undefined ? { contentJson } : {}) }
          : old,
      );
      qc.invalidateQueries({ queryKey: queryKeys.features(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
    },
  });
}

export function useCreateDocument() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentCreateInput) =>
      fetchJson<DocumentFull>(apiPath(pid, 'documents'), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (doc) => {
      qc.setQueryData(queryKeys.document(pid, doc.id), doc);
      qc.invalidateQueries({ queryKey: queryKeys.features(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
    },
  });
}

export function useDeleteDocument() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<void>(apiPath(pid, 'documents', id), { method: 'DELETE' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.features(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserCreateInput) =>
      fetchJson<User>('/api/users', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export interface UpdateCollaboratorsVars {
  featureId: string;
  userIds: string[];
}

/** Replaces a feature's collaborator set (PUT, returns 204). */
export function useCollaborators() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ featureId, userIds }: UpdateCollaboratorsVars) =>
      fetchJson<void>(apiPath(pid, 'features', featureId, 'collaborators'), {
        method: 'PUT',
        body: JSON.stringify({ userIds }),
      }),
    onSettled: (_data, _err, { featureId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.feature(pid, featureId) });
      qc.invalidateQueries({ queryKey: queryKeys.activity(pid, featureId) });
    },
  });
}

export interface UpdateProjectVars extends ProjectUpdateInput {
  id: string;
}

export function useUpdateProject() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateProjectVars) =>
      fetchJson<Project>(`/api/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (project) => {
      qc.setQueryData<OverviewResponse>(queryKeys.overview(pid), (old) =>
        old ? { ...old, project } : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
    },
  });
}

// ---- voting (see comments-voting design addendum) ----

export type VoteInput = 1 | -1 | 0;

interface VoteCounts {
  score: number;
  boosts: number;
  cools: number;
  myVote: VoteInput;
}

/** Derive the optimistic vote summary for a feature given the next vote value. */
function applyVote<T extends VoteCounts>(f: T, value: VoteInput): T {
  const boosts = f.boosts - (f.myVote === 1 ? 1 : 0) + (value === 1 ? 1 : 0);
  const cools = f.cools - (f.myVote === -1 ? 1 : 0) + (value === -1 ? 1 : 0);
  return { ...f, boosts, cools, score: boosts - cools, myVote: value };
}

function applyVoteInCaches(qc: QueryClient, pid: string, featureId: string, value: VoteInput) {
  qc.setQueryData<FeatureWithDocs[]>(queryKeys.features(pid), (old) =>
    old?.map((f) => (f.id === featureId ? applyVote(f, value) : f)),
  );
  qc.setQueryData<FeatureWithDocs>(queryKeys.feature(pid, featureId), (old) =>
    old ? applyVote(old, value) : old,
  );
  qc.setQueryData<OverviewResponse>(queryKeys.overview(pid), (old) =>
    old
      ? {
          ...old,
          features: old.features.map((f) => (f.id === featureId ? applyVote(f, value) : f)),
        }
      : old,
  );
}

/**
 * Optimistic vote PUT for a feature: 1 = boost, -1 = cool, 0 = clear.
 * Snapshots feature caches, applies the derived summary immediately,
 * rolls back on error, reconciles with the server summary on settle.
 */
export function useVote(featureId: string) {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: VoteInput) =>
      fetchJson<VoteCounts>(apiPath(pid, 'features', featureId, 'vote'), {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    onMutate: async (value) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.features(pid) }),
        qc.cancelQueries({ queryKey: queryKeys.overview(pid) }),
        qc.cancelQueries({ queryKey: queryKeys.feature(pid, featureId) }),
      ]);
      const snapshot = {
        features: qc.getQueryData<FeatureWithDocs[]>(queryKeys.features(pid)),
        feature: qc.getQueryData<FeatureWithDocs>(queryKeys.feature(pid, featureId)),
        overview: qc.getQueryData<OverviewResponse>(queryKeys.overview(pid)),
      };
      applyVoteInCaches(qc, pid, featureId, value);
      return snapshot;
    },
    onError: (_err, _value, snapshot) => {
      if (!snapshot) return;
      qc.setQueryData(queryKeys.features(pid), snapshot.features);
      qc.setQueryData(queryKeys.feature(pid, featureId), snapshot.feature);
      qc.setQueryData(queryKeys.overview(pid), snapshot.overview);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.features(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.feature(pid, featureId) });
      qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
    },
  });
}

// ---- comments (see comments-voting design addendum) ----

/** Exactly one of featureId / documentId identifies a comment surface. */
export interface CommentTarget {
  featureId?: string;
  documentId?: string;
}

function commentsKey(pid: string, target: CommentTarget) {
  return ['p', pid, 'comments', target.featureId ?? null, target.documentId ?? null] as const;
}

function commentsSearch(target: CommentTarget): string {
  return target.featureId
    ? `featureId=${target.featureId}`
    : `documentId=${target.documentId ?? ''}`;
}

/** Threads for a feature or a doc — unresolved first, newest roots first. */
export function useComments(target: CommentTarget) {
  const pid = useProjectId();
  return useQuery({
    queryKey: commentsKey(pid, target),
    queryFn: () => fetchJson<CommentThread[]>(`${apiPath(pid, 'comments')}?${commentsSearch(target)}`),
    enabled: Boolean(target.featureId || target.documentId),
  });
}

/** Invalidate everything a comment write can change: the thread list, attention counts, and the feature activity feed. */
function invalidateComments(qc: QueryClient, pid: string, target: CommentTarget) {
  qc.invalidateQueries({ queryKey: commentsKey(pid, target) });
  qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
  if (target.featureId) {
    qc.invalidateQueries({ queryKey: queryKeys.activity(pid, target.featureId) });
  }
}

export interface AddCommentVars {
  target: CommentTarget;
  body: string;
  /** Thread root id when replying (one level deep). */
  parentId?: string;
}

export function useAddComment() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ target, body, parentId }: AddCommentVars) =>
      fetchJson<Comment>(apiPath(pid, 'comments'), {
        method: 'POST',
        // Replies carry only parentId + body; roots carry the target surface (featureId or documentId).
        body: JSON.stringify(parentId ? { parentId, body } : { ...target, body }),
      }),
    onSettled: (_data, _err, { target }) => invalidateComments(qc, pid, target),
  });
}

type CommentsSnapshot = CommentThread[] | undefined;

async function snapshotComments(
  qc: QueryClient,
  pid: string,
  target: CommentTarget,
): Promise<CommentsSnapshot> {
  await qc.cancelQueries({ queryKey: commentsKey(pid, target) });
  return qc.getQueryData<CommentThread[]>(commentsKey(pid, target));
}

export interface EditCommentVars {
  target: CommentTarget;
  id: string;
  body: string;
}

/** Optimistic body edit (root or reply). */
export function useEditComment() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: EditCommentVars) =>
      fetchJson<Comment>(apiPath(pid, 'comments', id), {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      }),
    onMutate: async ({ target, id, body }) => {
      const snapshot = await snapshotComments(qc, pid, target);
      qc.setQueryData<CommentThread[]>(commentsKey(pid, target), (old) =>
        old?.map((t) =>
          t.id === id
            ? { ...t, body }
            : { ...t, replies: t.replies.map((r) => (r.id === id ? { ...r, body } : r)) },
        ),
      );
      return snapshot;
    },
    onError: (_err, { target }, snapshot) => {
      qc.setQueryData(commentsKey(pid, target), snapshot);
    },
    onSettled: (_data, _err, { target }) => invalidateComments(qc, pid, target),
  });
}

export interface ResolveCommentVars {
  target: CommentTarget;
  id: string;
  resolved: boolean;
}

/** Optimistic resolve / reopen on a thread root; refreshes attention counts on settle. */
export function useResolveComment() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolved }: ResolveCommentVars) =>
      fetchJson<Comment>(apiPath(pid, 'comments', id, 'resolve'), {
        method: 'PATCH',
        body: JSON.stringify({ resolved }),
      }),
    onMutate: async ({ target, id, resolved }) => {
      const snapshot = await snapshotComments(qc, pid, target);
      const resolvedAt = resolved ? new Date().toISOString() : null;
      qc.setQueryData<CommentThread[]>(commentsKey(pid, target), (old) =>
        old?.map((t) =>
          t.id === id ? { ...t, resolvedAt, resolvedBy: null } : t,
        ),
      );
      return snapshot;
    },
    onError: (_err, { target }, snapshot) => {
      qc.setQueryData(commentsKey(pid, target), snapshot);
    },
    onSettled: (_data, _err, { target }) => invalidateComments(qc, pid, target),
  });
}

export interface DeleteCommentVars {
  target: CommentTarget;
  id: string;
}

/** Optimistic delete (removes the whole thread for roots, the single reply otherwise). */
export function useDeleteComment() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: DeleteCommentVars) =>
      fetchJson<void>(apiPath(pid, 'comments', id), { method: 'DELETE' }),
    onMutate: async ({ target, id }) => {
      const snapshot = await snapshotComments(qc, pid, target);
      qc.setQueryData<CommentThread[]>(commentsKey(pid, target), (old) =>
        old
          ?.filter((t) => t.id !== id)
          .map((t) => ({ ...t, replies: t.replies.filter((r) => r.id !== id) })),
      );
      return snapshot;
    },
    onError: (_err, { target }, snapshot) => {
      qc.setQueryData(commentsKey(pid, target), snapshot);
    },
    onSettled: (_data, _err, { target }) => invalidateComments(qc, pid, target),
  });
}

// ---- workspace activity (Time Machine — Spec 2.1) ----
// Append-only block: self-contained, including its import (hoisted by ESM).

import type { WorkspaceActivityItem } from '@productmap/shared';

/** Project-scoped workspace activity feed, ascending (replay order). Fetched lazily — pass enabled=false until History mode is on. */
export function useWorkspaceActivity(enabled = true, since?: Date) {
  const pid = useProjectId();
  return useQuery({
    queryKey: queryKeys.workspaceActivity(pid),
    queryFn: () =>
      fetchJson<WorkspaceActivityItem[]>(
        apiPath(pid, 'activity') + (since ? `?since=${encodeURIComponent(since.toISOString())}` : ''),
      ),
    enabled,
    staleTime: 30_000,
  });
}

// ---- settings (Settings spec — Workspace & Profile tabs) ----
// Append-only block: self-contained.

export interface UpdateUserVars {
  id: string;
  name?: string;
  color?: string;
}

/**
 * PATCH /api/users/:id — rename and/or recolor a user. Avatars appear on the
 * board, comments and activity, so refresh the whole cache (cheap, rare op).
 */
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateUserVars) =>
      fetchJson<User>(`/api/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSettled: () => {
      qc.invalidateQueries();
    },
  });
}

/**
 * POST /api/admin/reset-demo — truncate + reseed (dev-only convenience;
 * the server 403s in production). Invalidates everything on success.
 */
export function useResetDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchJson<{ ok: boolean }>('/api/admin/reset-demo', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

// ---- templates (Settings spec — template manager) ----
// Append-only block: self-contained, including its import (hoisted by ESM).

import type { Template } from '@productmap/shared';

export interface TemplateCreateInput {
  type: DocType;
  name: string;
  description?: string;
  bodyJson?: Record<string, unknown>;
  promptHints?: string;
}

export interface TemplateUpdateInput {
  name?: string;
  description?: string;
  bodyJson?: Record<string, unknown>;
  promptHints?: string;
}

export const templatesRootKey = ['templates'] as const;

export function templatesKey(includeArchived = false) {
  return ['templates', { includeArchived }] as const;
}

/** Templates, defaults first then name (server order). includeArchived for the manager view. */
export function useTemplates(options: { includeArchived?: boolean } = {}) {
  const includeArchived = options.includeArchived ?? false;
  return useQuery({
    queryKey: templatesKey(includeArchived),
    queryFn: () =>
      fetchJson<Template[]>(
        `/api/templates${includeArchived ? '?includeArchived=true' : ''}`,
      ),
  });
}

function invalidateTemplates(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: templatesRootKey });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TemplateCreateInput) =>
      fetchJson<Template>('/api/templates', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => invalidateTemplates(qc),
  });
}

export interface UpdateTemplateVars extends TemplateUpdateInput {
  id: string;
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateTemplateVars) =>
      fetchJson<Template>(`/api/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (tpl, { bodyJson }) => {
      // Merge server row into both list caches without clobbering the
      // template editor's local bodyJson (mirrors useUpdateDocument).
      for (const includeArchived of [false, true]) {
        qc.setQueryData<Template[]>(templatesKey(includeArchived), (old) =>
          old?.map((t) =>
            t.id === tpl.id
              ? { ...t, ...tpl, ...(bodyJson !== undefined ? { bodyJson } : {}) }
              : t,
          ),
        );
      }
    },
  });
}

export function useDuplicateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<Template>(`/api/templates/${id}/duplicate`, { method: 'POST' }),
    onSettled: () => invalidateTemplates(qc),
  });
}

/** POST /api/templates/:id/default — swaps the default within the template's type. */
export function useSetDefaultTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<void>(`/api/templates/${id}/default`, { method: 'POST' }),
    onSettled: () => invalidateTemplates(qc),
  });
}

export interface ArchiveTemplateVars {
  id: string;
  archived: boolean;
}

/** Archive / restore. Archiving the current default 400s — surface the server message. */
export function useArchiveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: ArchiveTemplateVars) =>
      fetchJson<Template>(`/api/templates/${id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ archived }),
      }),
    onSettled: () => invalidateTemplates(qc),
  });
}

// ---- releases & objectives (Dream tier D7/D9 — releases+outcomes agent) ----
// Append-only block: self-contained, including its imports (hoisted by ESM).

import type { Objective, Release } from '@productmap/shared';

/** GET /api/releases rows carry a joined feature count. */
export interface ReleaseListItem extends Release {
  featureCount: number;
}

/** GET /api/releases/:id includes the release's features. */
export interface ReleaseDetail extends Release {
  features: Feature[];
}

export interface ReleaseCreateInput {
  name: string;
  targetDate?: string | null;
}

/** Status moves BOTH ways server-side (shipped→planned clears shippedAt). */
export interface ReleaseUpdateInput {
  name?: string;
  targetDate?: string | null;
  status?: Release['status'];
}

export const releasesKey = (pid: string) => ['p', pid, 'releases'] as const;
export const releaseKey = (pid: string, id: string) => ['p', pid, 'releases', id] as const;

export function useReleases() {
  const pid = useProjectId();
  return useQuery({
    queryKey: releasesKey(pid),
    queryFn: () => fetchJson<ReleaseListItem[]>(apiPath(pid, 'releases')),
  });
}

export function useRelease(id: string) {
  const pid = useProjectId();
  return useQuery({
    queryKey: releaseKey(pid, id),
    queryFn: () => fetchJson<ReleaseDetail>(apiPath(pid, 'releases', id)),
    enabled: !!id,
  });
}

function invalidateReleases(qc: QueryClient, pid: string, id?: string) {
  qc.invalidateQueries({ queryKey: releasesKey(pid) });
  if (id) qc.invalidateQueries({ queryKey: releaseKey(pid, id) });
}

export function useCreateRelease() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReleaseCreateInput) =>
      fetchJson<Release>(apiPath(pid, 'releases'), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => invalidateReleases(qc, pid),
  });
}

export interface UpdateReleaseVars extends ReleaseUpdateInput {
  id: string;
}

export function useUpdateRelease() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateReleaseVars) =>
      fetchJson<Release>(apiPath(pid, 'releases', id), {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSettled: (_data, _err, { id, status }) => {
      invalidateReleases(qc, pid, id);
      if (status !== undefined) {
        // Status flips ride on features too (gantt milestone, share changelog).
        qc.invalidateQueries({ queryKey: queryKeys.features(pid) });
        qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
      }
    },
  });
}

export function useDeleteRelease() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<void>(apiPath(pid, 'releases', id), { method: 'DELETE' }),
    onSettled: () => invalidateReleases(qc, pid),
  });
}

export function objectivesKey(pid: string) {
  return ['p', pid, 'objectives'] as const;
}

export function useObjectives() {
  const pid = useProjectId();
  return useQuery({
    queryKey: objectivesKey(pid),
    queryFn: () => fetchJson<Objective[]>(apiPath(pid, 'objectives')),
  });
}

/** Best-effort human message from an ApiError body ({ message } | { error }). */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.body && typeof err.body === 'object') {
    const body = err.body as { message?: unknown; error?: unknown };
    if (typeof body.message === 'string' && body.message) return body.message;
    if (typeof body.error === 'string' && body.error) return body.error;
  }
  return fallback;
}

// ============================================================================
// APPEND BLOCK — sharing (dream tier D8: share page + settings sharing block).
// Owned by the share/settings task; keep additions inside this block.
// ============================================================================

type ShareData = import('@productmap/shared').ShareData;

/** POST /api/projects/:projectId/share/roadmap → { url: "/share/:token" }.
 * Nested under the project — editor-gated by the method gate. */
export function useCreateShare() {
  const pid = useProjectId();
  return useMutation({
    mutationFn: () =>
      fetchJson<{ url: string }>(apiPath(pid, 'share', 'roadmap'), { method: 'POST' }),
  });
}

/** DELETE /api/share/:token — revoke a share link (404 when unknown/revoked). */
export function useRevokeShare() {
  return useMutation({
    mutationFn: (token: string) =>
      fetchJson<{ ok: boolean }>(`/api/share/${token}`, { method: 'DELETE' }),
  });
}

/**
 * GET /api/share/:token/data — public, read-only roadmap aggregate.
 * Fetched plain on purpose: the share page runs in a fresh unauthenticated
 * context, so no x-user-id header (and no retries — 404 means revoked).
 */
export function useShareData(token: string) {
  return useQuery({
    queryKey: ['share', token],
    queryFn: async () => {
      const res = await activeFetch(`/api/share/${token}/data`);
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          // non-JSON error body
        }
        throw new ApiError(res.status, body);
      }
      return (await res.json()) as ShareData;
    },
    retry: false,
    enabled: token.length > 0,
  });
}

// ========================== END APPEND BLOCK ===============================

// ============================================================================
// APPEND BLOCK — copilot & decisions (dream tier D3/D5: copilot panel,
// AI doc review, decision extraction). Owned by the copilot task; keep
// additions inside this block. Imports hoisted by ESM.
// ============================================================================

import type {
  CopilotNudge,
  Decision,
  SuggestDecisionResponse,
} from '@productmap/shared';

export const copilotNudgesKey = (pid: string) => ['p', pid, 'copilot', 'nudges'] as const;
export const decisionsRootKey = (pid: string) => ['p', pid, 'decisions'] as const;

/** Derived hygiene nudges (no AI behind them). Fetched lazily — pass enabled=false until the panel opens. */
export function useCopilotNudges(enabled = true) {
  const pid = useProjectId();
  return useQuery({
    queryKey: copilotNudgesKey(pid),
    queryFn: () => fetchJson<CopilotNudge[]>(apiPath(pid, 'copilot', 'nudges')),
    enabled,
    staleTime: 30_000,
  });
}

/** POST /api/projects/:pid/ai/suggest-decision {commentId} — AI reads the thread, suggests a decision draft. */
export function useSuggestDecision() {
  const pid = useProjectId();
  return useMutation({
    mutationFn: (commentId: string) =>
      fetchJson<SuggestDecisionResponse>(apiPath(pid, 'ai', 'suggest-decision'), {
        method: 'POST',
        body: JSON.stringify({ commentId }),
      }),
  });
}

export interface DecisionCreateInput {
  featureId?: string;
  title: string;
  decisionMd: string;
  alternativesMd?: string;
  sourceCommentId?: string;
}

/** POST /api/projects/:pid/decisions — log a decision (optionally sourced from a resolved thread). */
export function useCreateDecision() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DecisionCreateInput) =>
      fetchJson<Decision>(apiPath(pid, 'decisions'), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: (_data, _err, { featureId }) => {
      qc.invalidateQueries({ queryKey: decisionsRootKey(pid) });
      if (featureId) {
        qc.invalidateQueries({ queryKey: queryKeys.activity(pid, featureId) });
      }
    },
  });
}

// ==================== END APPEND BLOCK (copilot & decisions) ===============

// ---- dream tier: evidence, decisions, dependencies (Feature page — D2/D3/D4) ----
// Append-only block: self-contained, including its imports (hoisted by ESM).

// (`Decision` is already imported by the copilot append block above.)
import type {
  Evidence,
  FeatureDependencies,
  FeatureSize,
} from '@productmap/shared';

// Feature PATCH extensions (declaration-merged into FeatureUpdateInput above):
// size / risk notes (D4+D6) and objective / release assignment (D7+D9).
export interface FeatureUpdateInput {
  size?: FeatureSize | null;
  riskMd?: string;
  objectiveId?: string | null;
  releaseId?: string | null;
}

/** Evidence row as the API returns it — author joined in for the card byline. */
export interface EvidenceItem extends Evidence {
  createdByName?: string | null;
  createdByColor?: string | null;
}

export const evidenceKey = (pid: string, featureId: string) =>
  [...queryKeys.feature(pid, featureId), 'evidence'] as const;

export function useEvidence(featureId: string) {
  const pid = useProjectId();
  return useQuery({
    queryKey: evidenceKey(pid, featureId),
    queryFn: () => fetchJson<EvidenceItem[]>(apiPath(pid, 'features', featureId, 'evidence')),
    enabled: !!featureId,
  });
}

export interface AddEvidenceVars {
  featureId: string;
  kind: Evidence['kind'];
  title: string;
  bodyMd?: string;
  sourceUrl?: string;
  weight?: number;
}

export function useAddEvidence() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ featureId, ...body }: AddEvidenceVars) =>
      fetchJson<EvidenceItem>(apiPath(pid, 'features', featureId, 'evidence'), {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSettled: (_data, _err, { featureId }) => {
      qc.invalidateQueries({ queryKey: evidenceKey(pid, featureId) });
    },
  });
}

export interface DeleteEvidenceVars {
  id: string;
  featureId: string;
}

export function useDeleteEvidence() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: DeleteEvidenceVars) =>
      fetchJson<void>(apiPath(pid, 'evidence', id), { method: 'DELETE' }),
    onSettled: (_data, _err, { featureId }) => {
      qc.invalidateQueries({ queryKey: evidenceKey(pid, featureId) });
    },
  });
}

export const decisionsKey = (pid: string, featureId: string) => ['p', pid, 'decisions', featureId] as const;

/** Decisions for a feature, newest first (display only here — creation lives with comments extraction). */
export function useDecisions(featureId: string) {
  const pid = useProjectId();
  return useQuery({
    queryKey: decisionsKey(pid, featureId),
    queryFn: () => fetchJson<Decision[]>(`${apiPath(pid, 'decisions')}?featureId=${featureId}`),
    enabled: !!featureId,
  });
}

export const dependenciesKey = (pid: string, featureId: string) =>
  [...queryKeys.feature(pid, featureId), 'dependencies'] as const;

/** Blockers (features blocking this one) and blocked (features this one blocks). */
export function useDependencies(featureId: string) {
  const pid = useProjectId();
  return useQuery({
    queryKey: dependenciesKey(pid, featureId),
    queryFn: () => fetchJson<FeatureDependencies>(apiPath(pid, 'features', featureId, 'dependencies')),
    enabled: !!featureId,
  });
}

export interface SetDependenciesVars {
  featureId: string;
  blockerIds: string[];
}

/**
 * Replace-set the blockers of a feature (PUT, returns the new graph).
 * Cycles are rejected server-side with 400 {error:'cycle'} — surface via
 * isCycleError at the call site. blockerIds also ride on the features list
 * (board blocked badge), so feature caches refresh too.
 */
export function useSetDependencies() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ featureId, blockerIds }: SetDependenciesVars) =>
      fetchJson<FeatureDependencies>(apiPath(pid, 'features', featureId, 'dependencies'), {
        method: 'PUT',
        body: JSON.stringify({ blockerIds }),
      }),
    onSuccess: (graph, { featureId }) => {
      qc.setQueryData(dependenciesKey(pid, featureId), graph);
    },
    onSettled: (_data, _err, { featureId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.feature(pid, featureId) });
      qc.invalidateQueries({ queryKey: queryKeys.features(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.activity(pid, featureId) });
    },
  });
}

/** True when the PUT /dependencies failure is the server's cycle rejection. */
export function isCycleError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 400 &&
    typeof err.body === 'object' &&
    err.body !== null &&
    (err.body as { error?: unknown }).error === 'cycle'
  );
}
// ======================= END APPEND BLOCK (feature page) ====================

// ---- ideas (Dream tier D1 — Idea Inbox) ----
// Append-only block: self-contained, including its import (hoisted by ESM).

import type { IdeaStatus, IdeaWithVotes } from '@productmap/shared';

export function ideasRootKey(pid: string) {
  return ['p', pid, 'ideas'] as const;
}

export function ideasKey(pid: string, status?: IdeaStatus) {
  return ['p', pid, 'ideas', status ?? 'all'] as const;
}

/** Ideas, newest first, optionally filtered by status (server-side). */
export function useIdeas(status?: IdeaStatus) {
  const pid = useProjectId();
  return useQuery({
    queryKey: ideasKey(pid, status),
    queryFn: () =>
      fetchJson<IdeaWithVotes[]>(apiPath(pid, 'ideas') + (status ? `?status=${status}` : '')),
  });
}

export interface IdeaCreateInput {
  title: string;
  bodyMd?: string;
  source?: string;
}

export function useCreateIdea() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IdeaCreateInput) =>
      fetchJson<IdeaWithVotes>(apiPath(pid, 'ideas'), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ideasRootKey(pid) });
    },
  });
}

export interface IdeaUpdateInput {
  title?: string;
  bodyMd?: string;
  source?: string;
  status?: IdeaStatus;
}

export interface UpdateIdeaVars extends IdeaUpdateInput {
  id: string;
}

export function useUpdateIdea() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateIdeaVars) =>
      fetchJson<IdeaWithVotes>(apiPath(pid, 'ideas', id), {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ideasRootKey(pid) });
    },
  });
}

/**
 * Optimistic vote PUT for an idea: 1 = boost, -1 = cool, 0 = clear.
 * Mirrors useVote — snapshots every ideas list cache (one per status filter),
 * applies the derived summary immediately, rolls back on error.
 */
export function useIdeaVote(ideaId: string) {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: VoteInput) =>
      fetchJson<VoteCounts>(apiPath(pid, 'ideas', ideaId, 'vote'), {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    onMutate: async (value) => {
      await qc.cancelQueries({ queryKey: ideasRootKey(pid) });
      const snapshot = qc.getQueriesData<IdeaWithVotes[]>({ queryKey: ideasRootKey(pid) });
      qc.setQueriesData<IdeaWithVotes[]>({ queryKey: ideasRootKey(pid) }, (old) =>
        old?.map((i) => (i.id === ideaId ? applyVote(i, value) : i)),
      );
      return snapshot;
    },
    onError: (_err, _value, snapshot) => {
      for (const [key, data] of snapshot ?? []) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ideasRootKey(pid) });
    },
  });
}

export interface PromoteIdeaVars {
  id: string;
  horizon: Horizon;
  withAiBrief?: boolean;
}

/** POST /api/projects/:pid/ideas/:id/promote — idea → feature (optionally drafting an AI brief). Returns the new feature. */
export function usePromoteIdea() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: PromoteIdeaVars) =>
      fetchJson<Feature>(apiPath(pid, 'ideas', id, 'promote'), {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ideasRootKey(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.features(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
    },
  });
}

// -- dream tier 2: idea editing + pitch docs (Inbox agent additions) --

export function ideaKey(pid: string, id: string) {
  return ['p', pid, 'ideas', 'detail', id] as const;
}

/** Single idea with creator + pitchDoc meta (GET /api/projects/:pid/ideas/:id). Used by the editor back-link for idea-owned docs. */
export function useIdea(id: string) {
  const pid = useProjectId();
  return useQuery({
    queryKey: ideaKey(pid, id),
    queryFn: () => fetchJson<IdeaWithVotes>(apiPath(pid, 'ideas', id)),
    enabled: !!id,
  });
}

/**
 * POST /api/projects/:pid/ideas/:id/pitch — create the idea's pitch doc from the default
 * idea_pitch template (409 when one exists). Seeds the document cache so
 * navigating straight to /docs/:id renders without a refetch.
 */
export function useCreatePitch() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ideaId: string) =>
      fetchJson<DocumentFull>(apiPath(pid, 'ideas', ideaId, 'pitch'), { method: 'POST' }),
    onSuccess: (doc) => {
      qc.setQueryData(queryKeys.document(pid, doc.id), doc);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ideasRootKey(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.allDocuments(pid) });
    },
  });
}

// ---- gantt upgrades (Dream Tier — releases + dependency arrows + capacity) ----
// Append-only block: self-contained, including its imports (hoisted by ESM).

import type { DependencyEdge } from '@/components/gantt/DependencyArrows';

// releasesKey / useReleases live in the releases & objectives block above;
// FeatureDependencies is already imported by the feature-page block.

export function allDependenciesKey(pid: string, featureIds: string[]) {
  return ['p', pid, 'dependencies', 'all', [...featureIds].sort().join(',')] as const;
}

/**
 * Workspace dependency edges (blocker → blocked), assembled client-side from
 * the per-feature GET /api/projects/:pid/features/:id/dependencies endpoint (the spec
 * defines no all-edges endpoint). Each blocker entry yields one edge; the
 * `blocked` halves are the same edges seen from the other side, so reading
 * blockers alone covers the whole graph without duplicates.
 */
export function useAllDependencies(featureIds: string[]) {
  const pid = useProjectId();
  return useQuery({
    queryKey: allDependenciesKey(pid, featureIds),
    enabled: featureIds.length > 0,
    queryFn: async (): Promise<DependencyEdge[]> => {
      const perFeature = await Promise.all(
        featureIds.map(async (id) => ({
          id,
          deps: await fetchJson<FeatureDependencies>(apiPath(pid, 'features', id, 'dependencies')),
        })),
      );
      return perFeature.flatMap(({ id, deps }) =>
        deps.blockers.map((b) => ({ blockerId: b.id, blockedId: id })),
      );
    },
  });
}

// ============================================================================
// APPEND BLOCK — outcomes & release detail (dream tier 2, spec §3–5/7).
// Owned by the outcomes+release-detail task; keep additions inside this block.
// Imports hoisted by ESM.
// ============================================================================

import type { ObjectiveStatus } from '@productmap/shared';

export interface ObjectiveCreateInput {
  title: string;
  descriptionMd?: string;
  metric?: string;
  target?: string;
  current?: string;
  status?: ObjectiveStatus;
  ownerId?: string | null;
  quarter?: string;
}

export type ObjectiveUpdateInput = Partial<ObjectiveCreateInput>;

export function useCreateObjective() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ObjectiveCreateInput) =>
      fetchJson<Objective>(apiPath(pid, 'objectives'), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: objectivesKey(pid) });
    },
  });
}

export interface UpdateObjectiveVars extends ObjectiveUpdateInput {
  id: string;
}

export function useUpdateObjective() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateObjectiveVars) =>
      fetchJson<Objective>(apiPath(pid, 'objectives', id), {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: objectivesKey(pid) });
    },
  });
}

/**
 * POST /api/projects/:pid/releases/:id/notes-doc — the release's notes doc,
 * created from the default release_notes template when none is linked yet.
 * Seeds the document cache so navigating straight to /docs/:id renders without
 * a refetch.
 */
export function useCreateReleaseNotesDoc() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (releaseId: string) =>
      fetchJson<DocumentFull>(apiPath(pid, 'releases', releaseId, 'notes-doc'), { method: 'POST' }),
    onSuccess: (doc) => {
      qc.setQueryData(queryKeys.document(pid, doc.id), doc);
    },
    onSettled: (_data, _err, releaseId) => {
      qc.invalidateQueries({ queryKey: releasesKey(pid) });
      qc.invalidateQueries({ queryKey: releaseKey(pid, releaseId) });
      qc.invalidateQueries({ queryKey: queryKeys.allDocuments(pid) });
    },
  });
}

/**
 * POST /api/projects/:pid/releases/:id/generate-notes — pure assembly from
 * member features' final docs, OVERWRITING the notes doc body (creates the doc
 * first if needed).
 */
export function useGenerateReleaseNotes() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (releaseId: string) =>
      fetchJson<DocumentFull>(apiPath(pid, 'releases', releaseId, 'generate-notes'), { method: 'POST' }),
    onSuccess: (doc) => {
      qc.setQueryData(queryKeys.document(pid, doc.id), doc);
    },
    onSettled: (_data, _err, releaseId) => {
      qc.invalidateQueries({ queryKey: releasesKey(pid) });
      qc.invalidateQueries({ queryKey: releaseKey(pid, releaseId) });
      qc.invalidateQueries({ queryKey: queryKeys.allDocuments(pid) });
    },
  });
}

export interface SetReleaseFeaturesVars {
  releaseId: string;
  featureIds: string[];
}

/**
 * PUT /api/projects/:pid/releases/:id/features — replace-set membership
 * (sets/clears features.release_id), so feature caches refresh alongside the
 * release.
 */
export function useSetReleaseFeatures() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ releaseId, featureIds }: SetReleaseFeaturesVars) =>
      fetchJson<ReleaseDetail>(apiPath(pid, 'releases', releaseId, 'features'), {
        method: 'PUT',
        body: JSON.stringify({ featureIds }),
      }),
    onSuccess: (detail, { releaseId }) => {
      qc.setQueryData(releaseKey(pid, releaseId), detail);
    },
    onSettled: (_data, _err, { releaseId }) => {
      qc.invalidateQueries({ queryKey: releasesKey(pid) });
      qc.invalidateQueries({ queryKey: releaseKey(pid, releaseId) });
      qc.invalidateQueries({ queryKey: queryKeys.features(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
    },
  });
}

// ============== END APPEND BLOCK (outcomes & release detail) ===============

// ============================================================================
// APPEND BLOCK — roadmap scenario plans (dream tier 2 §6: plan switcher,
// scenario editing, ghost compare, apply). Owned by the roadmap scenarios
// task; keep additions inside this block.
// ============================================================================

// (`Horizon` is already imported at the top of this file.)
import type { Plan, PlanApplyResult, PlanWithEntries } from '@productmap/shared';

export const plansKey = (pid: string) => ['p', pid, 'plans'] as const;
export const planKey = (pid: string, id: string) => ['p', pid, 'plans', id] as const;

export function usePlans() {
  const pid = useProjectId();
  return useQuery({
    queryKey: plansKey(pid),
    queryFn: () => fetchJson<Plan[]>(apiPath(pid, 'plans')),
  });
}

/** Full plan snapshot (entries) — drives scenario-mode bar rendering. */
export function usePlan(id: string | null) {
  const pid = useProjectId();
  return useQuery({
    queryKey: planKey(pid, id ?? ''),
    queryFn: () => fetchJson<PlanWithEntries>(apiPath(pid, 'plans', id!)),
    enabled: !!id,
  });
}

export interface PlanCreateInput {
  name: string;
  /** Snapshot source — the live schedule (default) or another plan's entries. */
  copyFrom?: 'current' | string;
}

export function useCreatePlan() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlanCreateInput) =>
      fetchJson<PlanWithEntries>(apiPath(pid, 'plans'), { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (plan) => qc.setQueryData(planKey(pid, plan.id), plan),
    onSettled: () => qc.invalidateQueries({ queryKey: plansKey(pid) }),
  });
}

export function useRenamePlan() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      fetchJson<Plan>(apiPath(pid, 'plans', id), { method: 'PATCH', body: JSON.stringify({ name }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: plansKey(pid) }),
  });
}

export function useDeletePlan() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<void>(apiPath(pid, 'plans', id), { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: plansKey(pid) }),
  });
}

export interface PlanEntryUpdateVars {
  planId: string;
  featureId: string;
  startDate?: string | null;
  endDate?: string | null;
  horizon?: Horizon;
}

/**
 * PUT /api/projects/:pid/plans/:id/entries/:featureId — scenario editing.
 * Touches plan entries ONLY (never features); optimistic so drags settle instantly.
 */
export function useUpdatePlanEntry() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, featureId, ...patch }: PlanEntryUpdateVars) =>
      fetchJson<PlanWithEntries['entries'][number]>(
        apiPath(pid, 'plans', planId, 'entries', featureId),
        { method: 'PUT', body: JSON.stringify(patch) },
      ),
    onMutate: async ({ planId, featureId, ...patch }) => {
      await qc.cancelQueries({ queryKey: planKey(pid, planId) });
      const previous = qc.getQueryData<PlanWithEntries>(planKey(pid, planId));
      qc.setQueryData<PlanWithEntries>(planKey(pid, planId), (old) => {
        if (!old) return old;
        const exists = old.entries.some((e) => e.featureId === featureId);
        const entries = exists
          ? old.entries.map((e) => (e.featureId === featureId ? { ...e, ...patch } : e))
          : [
              ...old.entries,
              {
                planId,
                featureId,
                startDate: patch.startDate ?? null,
                endDate: patch.endDate ?? null,
                // Callers pass horizon on insert (tray drop); 'later' is a
                // safety net the server immediately corrects.
                horizon: patch.horizon ?? 'later',
              },
            ];
        return { ...old, entries };
      });
      return { previous };
    },
    onError: (_err, { planId }, ctx) => {
      if (ctx?.previous) qc.setQueryData(planKey(pid, planId), ctx.previous);
    },
    onSettled: (_data, _err, { planId }) =>
      qc.invalidateQueries({ queryKey: planKey(pid, planId) }),
  });
}

/** POST /api/projects/:pid/plans/:id/apply — promote the scenario to the real roadmap. */
export function useApplyPlan() {
  const pid = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      fetchJson<PlanApplyResult>(apiPath(pid, 'plans', planId, 'apply'), { method: 'POST' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: plansKey(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.features(pid) });
      qc.invalidateQueries({ queryKey: queryKeys.overview(pid) });
    },
  });
}

// ================= END APPEND BLOCK (roadmap scenario plans) ================

// ---- auth mutations (phase-1-auth) ----

export function useLogin() {
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      fetchJson<User>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  });
}
export function useRegister() {
  return useMutation({
    mutationFn: (input: { email: string; name: string; password: string }) =>
      fetchJson<User>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  });
}
export function useLogout() {
  return useMutation({
    mutationFn: () => fetchJson<void>('/api/auth/logout', { method: 'POST' }),
  });
}
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      fetchJson<User>('/api/auth/change-password', { method: 'POST', body: JSON.stringify(input) }),
  });
}

// ---- admin user management (phase-1-auth task 18) ----

export interface AdminUser { id: string; name: string; color: string; role: 'admin' | 'member'; email: string | null; isActive: boolean; }

export function useAdminUsers() {
  return useQuery({ queryKey: ['admin', 'users'], queryFn: () => fetchJson<AdminUser[]>('/api/admin/users') });
}

export function useAdminCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; name: string; role: 'admin' | 'member' }) =>
      fetchJson<{ user: AdminUser; tempPassword: string }>('/api/admin/users', { method: 'POST', body: JSON.stringify(input) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useAdminUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; role?: 'admin' | 'member'; isActive?: boolean; resetPassword?: boolean }) =>
      fetchJson<{ user: AdminUser; tempPassword?: string }>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// ============================================================================
// APPEND BLOCK — projects / members / invites (phase-2c-b: active-project seam).
// useProjects stays in project.tsx (the single ['projects'] source); list-
// mutating ops invalidate ['projects']. Imports hoisted by ESM.
// ============================================================================

import type { Invite, InvitePreview, MemberRole } from '@productmap/shared';
import type { ProjectListItem } from './project';

export const projectsListKey = ['projects'] as const;

export interface ProjectCreateInput {
  name: string;
  vision?: string;
}

/** POST /api/projects — owner-bootstrapping create; refreshes the project list. */
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectCreateInput) =>
      fetchJson<ProjectListItem>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectsListKey }),
  });
}

/** DELETE /api/projects/:projectId (owner-gated, 204). Refreshes the project list. */
export function useDeleteProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetchJson<void>(`/api/projects/${projectId}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectsListKey }),
  });
}

export interface ProjectMember {
  userId: string;
  role: MemberRole;
  name: string;
  color: string;
}

export const projectMembersKey = (pid: string) => ['project-members', pid] as const;

/** GET /api/projects/:projectId/members — joined name + color for avatars. */
export function useProjectMembers(projectId: string | null) {
  return useQuery({
    queryKey: projectMembersKey(projectId ?? ''),
    queryFn: () => fetchJson<ProjectMember[]>(`/api/projects/${projectId}/members`),
    enabled: !!projectId,
  });
}

export interface AddMemberVars {
  email?: string;
  userId?: string;
  role: MemberRole;
}

/** POST /api/projects/:projectId/members — add by email or userId (owner-gated). */
export function useAddMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMemberVars) =>
      fetchJson<{ userId: string; projectId: string; role: MemberRole }>(
        `/api/projects/${projectId}/members`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: projectMembersKey(projectId) }),
  });
}

export interface UpdateMemberVars {
  userId: string;
  role: MemberRole;
}

/** PATCH /api/projects/:projectId/members/:userId — change a member's role. */
export function useUpdateMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: UpdateMemberVars) =>
      fetchJson<{ userId: string; projectId: string; role: MemberRole }>(
        `/api/projects/${projectId}/members/${userId}`,
        { method: 'PATCH', body: JSON.stringify({ role }) },
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: projectMembersKey(projectId) }),
  });
}

/** DELETE /api/projects/:projectId/members/:userId (owner-gated, 204). */
export function useRemoveMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      fetchJson<void>(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectMembersKey(projectId) }),
  });
}

export const projectInvitesKey = (pid: string) => ['project-invites', pid] as const;

/** GET /api/projects/:projectId/invites — active (non-revoked) invites, newest first. */
export function useProjectInvites(projectId: string | null) {
  return useQuery({
    queryKey: projectInvitesKey(projectId ?? ''),
    queryFn: () => fetchJson<Invite[]>(`/api/projects/${projectId}/invites`),
    enabled: !!projectId,
  });
}

export interface CreateInviteVars {
  role: MemberRole;
  email?: string;
}

/** POST /api/projects/:projectId/invites — mint an invite token (emails when SMTP on). */
export function useCreateInvite(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInviteVars) =>
      fetchJson<{
        token: string;
        projectId: string;
        role: MemberRole;
        email: string | null;
        expiresAt: string;
        emailSent: boolean;
      }>(`/api/projects/${projectId}/invites`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectInvitesKey(projectId) }),
  });
}

/** DELETE /api/projects/:projectId/invites/:token — revoke (404 when unknown/revoked). */
export function useRevokeInvite(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      fetchJson<void>(`/api/projects/${projectId}/invites/${token}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: projectInvitesKey(projectId) }),
  });
}

/** GET /api/invites/:token — public-safe preview. 404 is meaningful (no retry). */
export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ['invite-preview', token],
    queryFn: () => fetchJson<InvitePreview>(`/api/invites/${token}`),
    retry: false,
    enabled: token.length > 0,
  });
}

/** POST /api/invites/:token/accept — join with the embedded role (idempotent). */
export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      fetchJson<{ projectId: string; role: MemberRole }>(`/api/invites/${token}/accept`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectsListKey }),
  });
}

// =============== END APPEND BLOCK (projects / members / invites) ============

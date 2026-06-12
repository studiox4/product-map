import { hc } from 'hono/client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  ActivityItem,
  Comment,
  CommentThread,
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
  Product,
  User,
} from '@productmap/shared';
import type { AppType } from '../../../api/src/app';

// ---- identity (no auth — demo; see feature-hub spec) ----

export const USER_ID_KEY = 'pmUserId';

export function getStoredUserId(): string | null {
  try {
    return localStorage.getItem(USER_ID_KEY);
  } catch {
    return null;
  }
}

export function setStoredUserId(id: string) {
  try {
    localStorage.setItem(USER_ID_KEY, id);
  } catch {
    // private mode etc. — identity falls back to first seeded user server-side
  }
}

function userIdHeaders(): Record<string, string> {
  const userId = getStoredUserId();
  return userId ? { 'x-user-id': userId } : {};
}

/** Typed hono client for the API (same-origin; Vite proxies /api in dev). */
export const api = hc<AppType>('/', { headers: userIdHeaders });

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
export interface ProductUpdateInput {
  name?: string;
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

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...userIdHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // non-json error body
    }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- query keys ----

export const queryKeys = {
  overview: ['overview'] as const,
  features: ['features'] as const,
  feature: (id: string) => ['features', id] as const,
  document: (id: string) => ['documents', id] as const,
  allDocuments: ['documents', 'all'] as const,
  users: ['users'] as const,
  activity: (featureId: string) => ['features', featureId, 'activity'] as const,
  aiStatus: ['ai', 'status'] as const,
};

// ---- queries ----

export function useOverview() {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: () => fetchJson<OverviewResponse>('/api/overview'),
  });
}

export function useFeatures() {
  return useQuery({
    queryKey: queryKeys.features,
    queryFn: () => fetchJson<FeatureWithDocs[]>('/api/features'),
  });
}

export function useFeature(id: string) {
  return useQuery({
    queryKey: queryKeys.feature(id),
    queryFn: () => fetchJson<FeatureWithDocs>(`/api/features/${id}`),
    enabled: !!id,
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: queryKeys.document(id),
    queryFn: () => fetchJson<DocumentFull>(`/api/documents/${id}`),
    enabled: !!id,
  });
}

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => fetchJson<User[]>('/api/users'),
  });
}

/** Current user, resolved from localStorage.pmUserId against the users list (falls back to the first user, mirroring the server). */
export function useMe() {
  const query = useUsers();
  const storedId = getStoredUserId();
  const me: User | null | undefined = query.data
    ? (query.data.find((u) => u.id === storedId) ?? query.data[0] ?? null)
    : undefined;
  return { ...query, me };
}

export function useActivity(featureId: string) {
  return useQuery({
    queryKey: queryKeys.activity(featureId),
    queryFn: () => fetchJson<ActivityItem[]>(`/api/features/${featureId}/activity`),
    enabled: !!featureId,
  });
}

export function useAllDocuments() {
  return useQuery({
    queryKey: queryKeys.allDocuments,
    queryFn: () => fetchJson<DocumentListItem[]>('/api/documents?all=true'),
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
  id: string,
  patch: FeatureUpdateInput,
) {
  qc.setQueryData<FeatureWithDocs[]>(queryKeys.features, (old) =>
    old?.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  );
  qc.setQueryData<FeatureWithDocs>(queryKeys.feature(id), (old) =>
    old ? { ...old, ...patch } : old,
  );
  qc.setQueryData<OverviewResponse>(queryKeys.overview, (old) =>
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateFeatureVars) =>
      fetchJson<Feature>(`/api/features/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onMutate: async ({ id, ...patch }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.features }),
        qc.cancelQueries({ queryKey: queryKeys.overview }),
      ]);
      const snapshot = {
        features: qc.getQueryData<FeatureWithDocs[]>(queryKeys.features),
        feature: qc.getQueryData<FeatureWithDocs>(queryKeys.feature(id)),
        overview: qc.getQueryData<OverviewResponse>(queryKeys.overview),
      };
      patchFeatureInCaches(qc, id, patch);
      return snapshot;
    },
    onError: (_err, { id }, snapshot) => {
      if (!snapshot) return;
      qc.setQueryData(queryKeys.features, snapshot.features);
      qc.setQueryData(queryKeys.feature(id), snapshot.feature);
      qc.setQueryData(queryKeys.overview, snapshot.overview);
    },
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.features });
      qc.invalidateQueries({ queryKey: queryKeys.feature(id) });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export function useCreateFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FeatureCreateInput) =>
      fetchJson<Feature>('/api/features', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.features });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export function useDeleteFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<void>(`/api/features/${id}`, { method: 'DELETE' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.features });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export interface UpdateDocumentVars extends DocumentUpdateInput {
  id: string;
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateDocumentVars) =>
      fetchJson<DocumentMeta>(`/api/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (meta, { id, contentJson }) => {
      // Merge server meta into the cached full document without clobbering
      // the editor's local contentJson (avoids re-render churn while typing).
      qc.setQueryData<DocumentFull>(queryKeys.document(id), (old) =>
        old
          ? { ...old, ...meta, ...(contentJson !== undefined ? { contentJson } : {}) }
          : old,
      );
      qc.invalidateQueries({ queryKey: queryKeys.features });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentCreateInput) =>
      fetchJson<DocumentFull>('/api/documents', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (doc) => {
      qc.setQueryData(queryKeys.document(doc.id), doc);
      qc.invalidateQueries({ queryKey: queryKeys.features });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<void>(`/api/documents/${id}`, { method: 'DELETE' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.features });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ featureId, userIds }: UpdateCollaboratorsVars) =>
      fetchJson<void>(`/api/features/${featureId}/collaborators`, {
        method: 'PUT',
        body: JSON.stringify({ userIds }),
      }),
    onSettled: (_data, _err, { featureId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.feature(featureId) });
      qc.invalidateQueries({ queryKey: queryKeys.activity(featureId) });
    },
  });
}

export interface UpdateProductVars extends ProductUpdateInput {
  id: string;
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateProductVars) =>
      fetchJson<Product>(`/api/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (product) => {
      qc.setQueryData<OverviewResponse>(queryKeys.overview, (old) =>
        old ? { ...old, product } : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.overview });
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

function applyVoteInCaches(qc: QueryClient, featureId: string, value: VoteInput) {
  qc.setQueryData<FeatureWithDocs[]>(queryKeys.features, (old) =>
    old?.map((f) => (f.id === featureId ? applyVote(f, value) : f)),
  );
  qc.setQueryData<FeatureWithDocs>(queryKeys.feature(featureId), (old) =>
    old ? applyVote(old, value) : old,
  );
  qc.setQueryData<OverviewResponse>(queryKeys.overview, (old) =>
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: VoteInput) =>
      fetchJson<VoteCounts>(`/api/features/${featureId}/vote`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    onMutate: async (value) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.features }),
        qc.cancelQueries({ queryKey: queryKeys.overview }),
        qc.cancelQueries({ queryKey: queryKeys.feature(featureId) }),
      ]);
      const snapshot = {
        features: qc.getQueryData<FeatureWithDocs[]>(queryKeys.features),
        feature: qc.getQueryData<FeatureWithDocs>(queryKeys.feature(featureId)),
        overview: qc.getQueryData<OverviewResponse>(queryKeys.overview),
      };
      applyVoteInCaches(qc, featureId, value);
      return snapshot;
    },
    onError: (_err, _value, snapshot) => {
      if (!snapshot) return;
      qc.setQueryData(queryKeys.features, snapshot.features);
      qc.setQueryData(queryKeys.feature(featureId), snapshot.feature);
      qc.setQueryData(queryKeys.overview, snapshot.overview);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.features });
      qc.invalidateQueries({ queryKey: queryKeys.feature(featureId) });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

// ---- comments (see comments-voting design addendum) ----

/** Exactly one of featureId / documentId identifies a comment surface. */
export interface CommentTarget {
  featureId?: string;
  documentId?: string;
}

function commentsKey(target: CommentTarget) {
  return ['comments', target.featureId ?? null, target.documentId ?? null] as const;
}

function commentsSearch(target: CommentTarget): string {
  return target.featureId
    ? `featureId=${target.featureId}`
    : `documentId=${target.documentId ?? ''}`;
}

/** Threads for a feature or a doc — unresolved first, newest roots first. */
export function useComments(target: CommentTarget) {
  return useQuery({
    queryKey: commentsKey(target),
    queryFn: () => fetchJson<CommentThread[]>(`/api/comments?${commentsSearch(target)}`),
    enabled: Boolean(target.featureId || target.documentId),
  });
}

/** Invalidate everything a comment write can change: the thread list, attention counts, and the feature activity feed. */
function invalidateComments(qc: QueryClient, target: CommentTarget) {
  qc.invalidateQueries({ queryKey: commentsKey(target) });
  qc.invalidateQueries({ queryKey: queryKeys.overview });
  if (target.featureId) {
    qc.invalidateQueries({ queryKey: queryKeys.activity(target.featureId) });
  }
}

export interface AddCommentVars {
  target: CommentTarget;
  body: string;
  /** Thread root id when replying (one level deep). */
  parentId?: string;
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ target, body, parentId }: AddCommentVars) =>
      fetchJson<Comment>('/api/comments', {
        method: 'POST',
        body: JSON.stringify({ ...target, body, ...(parentId ? { parentId } : {}) }),
      }),
    onSettled: (_data, _err, { target }) => invalidateComments(qc, target),
  });
}

type CommentsSnapshot = CommentThread[] | undefined;

async function snapshotComments(
  qc: QueryClient,
  target: CommentTarget,
): Promise<CommentsSnapshot> {
  await qc.cancelQueries({ queryKey: commentsKey(target) });
  return qc.getQueryData<CommentThread[]>(commentsKey(target));
}

export interface EditCommentVars {
  target: CommentTarget;
  id: string;
  body: string;
}

/** Optimistic body edit (root or reply). */
export function useEditComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: EditCommentVars) =>
      fetchJson<Comment>(`/api/comments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      }),
    onMutate: async ({ target, id, body }) => {
      const snapshot = await snapshotComments(qc, target);
      qc.setQueryData<CommentThread[]>(commentsKey(target), (old) =>
        old?.map((t) =>
          t.id === id
            ? { ...t, body }
            : { ...t, replies: t.replies.map((r) => (r.id === id ? { ...r, body } : r)) },
        ),
      );
      return snapshot;
    },
    onError: (_err, { target }, snapshot) => {
      qc.setQueryData(commentsKey(target), snapshot);
    },
    onSettled: (_data, _err, { target }) => invalidateComments(qc, target),
  });
}

export interface ResolveCommentVars {
  target: CommentTarget;
  id: string;
  resolved: boolean;
}

/** Optimistic resolve / reopen on a thread root; refreshes attention counts on settle. */
export function useResolveComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolved }: ResolveCommentVars) =>
      fetchJson<Comment>(`/api/comments/${id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ resolved }),
      }),
    onMutate: async ({ target, id, resolved }) => {
      const snapshot = await snapshotComments(qc, target);
      const resolvedAt = resolved ? new Date().toISOString() : null;
      qc.setQueryData<CommentThread[]>(commentsKey(target), (old) =>
        old?.map((t) =>
          t.id === id ? { ...t, resolvedAt, resolvedBy: resolved ? getStoredUserId() : null } : t,
        ),
      );
      return snapshot;
    },
    onError: (_err, { target }, snapshot) => {
      qc.setQueryData(commentsKey(target), snapshot);
    },
    onSettled: (_data, _err, { target }) => invalidateComments(qc, target),
  });
}

export interface DeleteCommentVars {
  target: CommentTarget;
  id: string;
}

/** Optimistic delete (removes the whole thread for roots, the single reply otherwise). */
export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: DeleteCommentVars) =>
      fetchJson<void>(`/api/comments/${id}`, { method: 'DELETE' }),
    onMutate: async ({ target, id }) => {
      const snapshot = await snapshotComments(qc, target);
      qc.setQueryData<CommentThread[]>(commentsKey(target), (old) =>
        old
          ?.filter((t) => t.id !== id)
          .map((t) => ({ ...t, replies: t.replies.filter((r) => r.id !== id) })),
      );
      return snapshot;
    },
    onError: (_err, { target }, snapshot) => {
      qc.setQueryData(commentsKey(target), snapshot);
    },
    onSettled: (_data, _err, { target }) => invalidateComments(qc, target),
  });
}

// ---- workspace activity (Time Machine — Spec 2.1) ----
// Append-only block: self-contained, including its import (hoisted by ESM).

import type { WorkspaceActivityItem } from '@productmap/shared';

export const workspaceActivityKey = ['activity', 'workspace'] as const;

/** Workspace-wide activity feed, ascending (replay order). Fetched lazily — pass enabled=false until History mode is on. */
export function useWorkspaceActivity(enabled = true) {
  return useQuery({
    queryKey: workspaceActivityKey,
    queryFn: () => fetchJson<WorkspaceActivityItem[]>('/api/activity'),
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

export const releasesKey = ['releases'] as const;
export const releaseKey = (id: string) => ['releases', id] as const;
export const objectivesKey = ['objectives'] as const;

export function useReleases() {
  return useQuery({
    queryKey: releasesKey,
    queryFn: () => fetchJson<ReleaseListItem[]>('/api/releases'),
  });
}

export function useRelease(id: string) {
  return useQuery({
    queryKey: releaseKey(id),
    queryFn: () => fetchJson<ReleaseDetail>(`/api/releases/${id}`),
    enabled: !!id,
  });
}

function invalidateReleases(qc: QueryClient, id?: string) {
  qc.invalidateQueries({ queryKey: releasesKey });
  if (id) qc.invalidateQueries({ queryKey: releaseKey(id) });
}

export function useCreateRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReleaseCreateInput) =>
      fetchJson<Release>('/api/releases', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => invalidateReleases(qc),
  });
}

export interface UpdateReleaseVars extends ReleaseUpdateInput {
  id: string;
}

export function useUpdateRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateReleaseVars) =>
      fetchJson<Release>(`/api/releases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSettled: (_data, _err, { id, status }) => {
      invalidateReleases(qc, id);
      if (status !== undefined) {
        // Status flips ride on features too (gantt milestone, share changelog).
        qc.invalidateQueries({ queryKey: queryKeys.features });
        qc.invalidateQueries({ queryKey: queryKeys.overview });
      }
    },
  });
}

export function useDeleteRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<void>(`/api/releases/${id}`, { method: 'DELETE' }),
    onSettled: () => invalidateReleases(qc),
  });
}

export function useObjectives() {
  return useQuery({
    queryKey: objectivesKey,
    queryFn: () => fetchJson<Objective[]>('/api/objectives'),
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

/** POST /api/share/roadmap → { url: "/share/:token" }. */
export function useCreateShare() {
  return useMutation({
    mutationFn: () =>
      fetchJson<{ url: string }>('/api/share/roadmap', { method: 'POST' }),
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
      const res = await fetch(`/api/share/${token}/data`);
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

export const copilotNudgesKey = ['copilot', 'nudges'] as const;
export const decisionsRootKey = ['decisions'] as const;

/** Derived hygiene nudges (no AI behind them). Fetched lazily — pass enabled=false until the panel opens. */
export function useCopilotNudges(enabled = true) {
  return useQuery({
    queryKey: copilotNudgesKey,
    queryFn: () => fetchJson<CopilotNudge[]>('/api/copilot/nudges'),
    enabled,
    staleTime: 30_000,
  });
}

/** POST /api/ai/suggest-decision {commentId} — AI reads the thread, suggests a decision draft. */
export function useSuggestDecision() {
  return useMutation({
    mutationFn: (commentId: string) =>
      fetchJson<SuggestDecisionResponse>('/api/ai/suggest-decision', {
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

/** POST /api/decisions — log a decision (optionally sourced from a resolved thread). */
export function useCreateDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DecisionCreateInput) =>
      fetchJson<Decision>('/api/decisions', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: (_data, _err, { featureId }) => {
      qc.invalidateQueries({ queryKey: decisionsRootKey });
      if (featureId) {
        qc.invalidateQueries({ queryKey: queryKeys.activity(featureId) });
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

export const evidenceKey = (featureId: string) =>
  [...queryKeys.feature(featureId), 'evidence'] as const;

export function useEvidence(featureId: string) {
  return useQuery({
    queryKey: evidenceKey(featureId),
    queryFn: () => fetchJson<EvidenceItem[]>(`/api/features/${featureId}/evidence`),
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ featureId, ...body }: AddEvidenceVars) =>
      fetchJson<EvidenceItem>(`/api/features/${featureId}/evidence`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSettled: (_data, _err, { featureId }) => {
      qc.invalidateQueries({ queryKey: evidenceKey(featureId) });
    },
  });
}

export interface DeleteEvidenceVars {
  id: string;
  featureId: string;
}

export function useDeleteEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: DeleteEvidenceVars) =>
      fetchJson<void>(`/api/evidence/${id}`, { method: 'DELETE' }),
    onSettled: (_data, _err, { featureId }) => {
      qc.invalidateQueries({ queryKey: evidenceKey(featureId) });
    },
  });
}

export const decisionsKey = (featureId: string) => ['decisions', featureId] as const;

/** Decisions for a feature, newest first (display only here — creation lives with comments extraction). */
export function useDecisions(featureId: string) {
  return useQuery({
    queryKey: decisionsKey(featureId),
    queryFn: () => fetchJson<Decision[]>(`/api/decisions?featureId=${featureId}`),
    enabled: !!featureId,
  });
}

export const dependenciesKey = (featureId: string) =>
  [...queryKeys.feature(featureId), 'dependencies'] as const;

/** Blockers (features blocking this one) and blocked (features this one blocks). */
export function useDependencies(featureId: string) {
  return useQuery({
    queryKey: dependenciesKey(featureId),
    queryFn: () => fetchJson<FeatureDependencies>(`/api/features/${featureId}/dependencies`),
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ featureId, blockerIds }: SetDependenciesVars) =>
      fetchJson<FeatureDependencies>(`/api/features/${featureId}/dependencies`, {
        method: 'PUT',
        body: JSON.stringify({ blockerIds }),
      }),
    onSuccess: (graph, { featureId }) => {
      qc.setQueryData(dependenciesKey(featureId), graph);
    },
    onSettled: (_data, _err, { featureId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.feature(featureId) });
      qc.invalidateQueries({ queryKey: queryKeys.features });
      qc.invalidateQueries({ queryKey: queryKeys.activity(featureId) });
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

export const ideasRootKey = ['ideas'] as const;

export function ideasKey(status?: IdeaStatus) {
  return ['ideas', status ?? 'all'] as const;
}

/** Ideas, newest first, optionally filtered by status (server-side). */
export function useIdeas(status?: IdeaStatus) {
  return useQuery({
    queryKey: ideasKey(status),
    queryFn: () =>
      fetchJson<IdeaWithVotes[]>(`/api/ideas${status ? `?status=${status}` : ''}`),
  });
}

export interface IdeaCreateInput {
  title: string;
  bodyMd?: string;
  source?: string;
}

export function useCreateIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IdeaCreateInput) =>
      fetchJson<IdeaWithVotes>('/api/ideas', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ideasRootKey });
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateIdeaVars) =>
      fetchJson<IdeaWithVotes>(`/api/ideas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ideasRootKey });
    },
  });
}

/**
 * Optimistic vote PUT for an idea: 1 = boost, -1 = cool, 0 = clear.
 * Mirrors useVote — snapshots every ideas list cache (one per status filter),
 * applies the derived summary immediately, rolls back on error.
 */
export function useIdeaVote(ideaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: VoteInput) =>
      fetchJson<VoteCounts>(`/api/ideas/${ideaId}/vote`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    onMutate: async (value) => {
      await qc.cancelQueries({ queryKey: ideasRootKey });
      const snapshot = qc.getQueriesData<IdeaWithVotes[]>({ queryKey: ideasRootKey });
      qc.setQueriesData<IdeaWithVotes[]>({ queryKey: ideasRootKey }, (old) =>
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
      qc.invalidateQueries({ queryKey: ideasRootKey });
    },
  });
}

export interface PromoteIdeaVars {
  id: string;
  horizon: Horizon;
  withAiBrief?: boolean;
}

/** POST /api/ideas/:id/promote — idea → feature (optionally drafting an AI brief). Returns the new feature. */
export function usePromoteIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: PromoteIdeaVars) =>
      fetchJson<Feature>(`/api/ideas/${id}/promote`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ideasRootKey });
      qc.invalidateQueries({ queryKey: queryKeys.features });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

// -- dream tier 2: idea editing + pitch docs (Inbox agent additions) --

export function ideaKey(id: string) {
  return ['ideas', 'detail', id] as const;
}

/** Single idea with creator + pitchDoc meta (GET /api/ideas/:id). Used by the editor back-link for idea-owned docs. */
export function useIdea(id: string) {
  return useQuery({
    queryKey: ideaKey(id),
    queryFn: () => fetchJson<IdeaWithVotes>(`/api/ideas/${id}`),
    enabled: !!id,
  });
}

/**
 * POST /api/ideas/:id/pitch — create the idea's pitch doc from the default
 * idea_pitch template (409 when one exists). Seeds the document cache so
 * navigating straight to /docs/:id renders without a refetch.
 */
export function useCreatePitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ideaId: string) =>
      fetchJson<DocumentFull>(`/api/ideas/${ideaId}/pitch`, { method: 'POST' }),
    onSuccess: (doc) => {
      qc.setQueryData(queryKeys.document(doc.id), doc);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ideasRootKey });
      qc.invalidateQueries({ queryKey: queryKeys.allDocuments });
    },
  });
}

// ---- gantt upgrades (Dream Tier — releases + dependency arrows + capacity) ----
// Append-only block: self-contained, including its imports (hoisted by ESM).

import type { DependencyEdge } from '@/components/gantt/DependencyArrows';

// releasesKey / useReleases live in the releases & objectives block above;
// FeatureDependencies is already imported by the feature-page block.

export function allDependenciesKey(featureIds: string[]) {
  return ['dependencies', 'all', [...featureIds].sort().join(',')] as const;
}

/**
 * Workspace dependency edges (blocker → blocked), assembled client-side from
 * the per-feature GET /api/features/:id/dependencies endpoint (the spec
 * defines no all-edges endpoint). Each blocker entry yields one edge; the
 * `blocked` halves are the same edges seen from the other side, so reading
 * blockers alone covers the whole graph without duplicates.
 */
export function useAllDependencies(featureIds: string[]) {
  return useQuery({
    queryKey: allDependenciesKey(featureIds),
    enabled: featureIds.length > 0,
    queryFn: async (): Promise<DependencyEdge[]> => {
      const perFeature = await Promise.all(
        featureIds.map(async (id) => ({
          id,
          deps: await fetchJson<FeatureDependencies>(`/api/features/${id}/dependencies`),
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ObjectiveCreateInput) =>
      fetchJson<Objective>('/api/objectives', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: objectivesKey });
    },
  });
}

export interface UpdateObjectiveVars extends ObjectiveUpdateInput {
  id: string;
}

export function useUpdateObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateObjectiveVars) =>
      fetchJson<Objective>(`/api/objectives/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: objectivesKey });
    },
  });
}

/**
 * POST /api/releases/:id/notes-doc — the release's notes doc, created from the
 * default release_notes template when none is linked yet. Seeds the document
 * cache so navigating straight to /docs/:id renders without a refetch.
 */
export function useCreateReleaseNotesDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (releaseId: string) =>
      fetchJson<DocumentFull>(`/api/releases/${releaseId}/notes-doc`, { method: 'POST' }),
    onSuccess: (doc) => {
      qc.setQueryData(queryKeys.document(doc.id), doc);
    },
    onSettled: (_data, _err, releaseId) => {
      qc.invalidateQueries({ queryKey: releasesKey });
      qc.invalidateQueries({ queryKey: releaseKey(releaseId) });
      qc.invalidateQueries({ queryKey: queryKeys.allDocuments });
    },
  });
}

/**
 * POST /api/releases/:id/generate-notes — pure assembly from member features'
 * final docs, OVERWRITING the notes doc body (creates the doc first if needed).
 */
export function useGenerateReleaseNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (releaseId: string) =>
      fetchJson<DocumentFull>(`/api/releases/${releaseId}/generate-notes`, { method: 'POST' }),
    onSuccess: (doc) => {
      qc.setQueryData(queryKeys.document(doc.id), doc);
    },
    onSettled: (_data, _err, releaseId) => {
      qc.invalidateQueries({ queryKey: releasesKey });
      qc.invalidateQueries({ queryKey: releaseKey(releaseId) });
      qc.invalidateQueries({ queryKey: queryKeys.allDocuments });
    },
  });
}

export interface SetReleaseFeaturesVars {
  releaseId: string;
  featureIds: string[];
}

/**
 * PUT /api/releases/:id/features — replace-set membership (sets/clears
 * features.release_id), so feature caches refresh alongside the release.
 */
export function useSetReleaseFeatures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ releaseId, featureIds }: SetReleaseFeaturesVars) =>
      fetchJson<ReleaseDetail>(`/api/releases/${releaseId}/features`, {
        method: 'PUT',
        body: JSON.stringify({ featureIds }),
      }),
    onSuccess: (detail, { releaseId }) => {
      qc.setQueryData(releaseKey(releaseId), detail);
    },
    onSettled: (_data, _err, { releaseId }) => {
      qc.invalidateQueries({ queryKey: releasesKey });
      qc.invalidateQueries({ queryKey: releaseKey(releaseId) });
      qc.invalidateQueries({ queryKey: queryKeys.features });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
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

export const plansKey = ['plans'] as const;
export const planKey = (id: string) => ['plans', id] as const;

export function usePlans() {
  return useQuery({
    queryKey: plansKey,
    queryFn: () => fetchJson<Plan[]>('/api/plans'),
  });
}

/** Full plan snapshot (entries) — drives scenario-mode bar rendering. */
export function usePlan(id: string | null) {
  return useQuery({
    queryKey: planKey(id ?? ''),
    queryFn: () => fetchJson<PlanWithEntries>(`/api/plans/${id}`),
    enabled: !!id,
  });
}

export interface PlanCreateInput {
  name: string;
  /** Snapshot source — the live schedule (default) or another plan's entries. */
  copyFrom?: 'current' | string;
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlanCreateInput) =>
      fetchJson<PlanWithEntries>('/api/plans', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (plan) => qc.setQueryData(planKey(plan.id), plan),
    onSettled: () => qc.invalidateQueries({ queryKey: plansKey }),
  });
}

export function useRenamePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      fetchJson<Plan>(`/api/plans/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: plansKey }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<void>(`/api/plans/${id}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: plansKey }),
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
 * PUT /api/plans/:id/entries/:featureId — scenario editing. Touches plan
 * entries ONLY (never features); optimistic so drags settle instantly.
 */
export function useUpdatePlanEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, featureId, ...patch }: PlanEntryUpdateVars) =>
      fetchJson<PlanWithEntries['entries'][number]>(
        `/api/plans/${planId}/entries/${featureId}`,
        { method: 'PUT', body: JSON.stringify(patch) },
      ),
    onMutate: async ({ planId, featureId, ...patch }) => {
      await qc.cancelQueries({ queryKey: planKey(planId) });
      const previous = qc.getQueryData<PlanWithEntries>(planKey(planId));
      qc.setQueryData<PlanWithEntries>(planKey(planId), (old) => {
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
      if (ctx?.previous) qc.setQueryData(planKey(planId), ctx.previous);
    },
    onSettled: (_data, _err, { planId }) =>
      qc.invalidateQueries({ queryKey: planKey(planId) }),
  });
}

/** POST /api/plans/:id/apply — promote the scenario to the real roadmap. */
export function useApplyPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      fetchJson<PlanApplyResult>(`/api/plans/${planId}/apply`, { method: 'POST' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: plansKey });
      qc.invalidateQueries({ queryKey: queryKeys.features });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

// ================= END APPEND BLOCK (roadmap scenario plans) ================

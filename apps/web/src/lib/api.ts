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

/** Best-effort human message from an ApiError body ({ message } | { error }). */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.body && typeof err.body === 'object') {
    const body = err.body as { message?: unknown; error?: unknown };
    if (typeof body.message === 'string' && body.message) return body.message;
    if (typeof body.error === 'string' && body.error) return body.error;
  }
  return fallback;
}

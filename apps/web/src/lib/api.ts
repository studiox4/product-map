import { hc } from 'hono/client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  ActivityItem,
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
}
export interface DocumentUpdateInput {
  title?: string;
  contentJson?: unknown;
  status?: DocStatus;
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

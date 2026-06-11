import type { Horizon, FeatureStatus, DocType, DocStatus, ActivityKind } from './constants';

export interface Product { id: string; name: string; vision: string; aboutMd: string; }
export interface User { id: string; name: string; color: string; createdAt: string; }
export type VoteValue = 1 | -1;
export interface VoteSummary { score: number; boosts: number; cools: number; myVote: VoteValue | 0; }
export interface Feature extends VoteSummary {
  id: string; productId: string; title: string; horizon: Horizon; status: FeatureStatus;
  startDate: string | null; endDate: string | null; sortOrder: number;
  descriptionMd: string; createdBy: string | null; updatedBy: string | null;
  createdAt: string; updatedAt: string;
}
export interface DocumentMeta {
  id: string; featureId: string; type: DocType; title: string; status: DocStatus;
  /** Curated gradient cover key; null/absent = no cover. Always present in API responses. */
  cover?: string | null;
  createdBy: string | null; updatedBy: string | null;
  createdAt: string; updatedAt: string;
}
export interface DocumentListItem extends DocumentMeta {
  featureTitle: string; featureHorizon: Horizon; wordCount: number;
}
export interface ActivityItem {
  id: string; featureId: string; actorId: string; actorName: string; actorColor: string;
  kind: ActivityKind; payload: Record<string, unknown> | null; createdAt: string;
}
/** Workspace-wide activity row (GET /api/activity) — actor + feature joined in. */
export interface WorkspaceActivityItem extends ActivityItem { featureTitle: string; }
// Activity payload shapes — enough to replay roadmap state (Time Machine).
export interface FeatureSnapshot {
  title: string; horizon: Horizon; status: FeatureStatus;
  startDate: string | null; endDate: string | null;
}
export interface FeatureCreatedPayload { to: string; snapshot: FeatureSnapshot; }
export interface HorizonChangedPayload { from: Horizon; to: Horizon; }
export interface StatusChangedPayload { from: FeatureStatus; to: FeatureStatus; }
export interface DatesChangedPayload {
  from: { startDate: string | null; endDate: string | null };
  to: { startDate: string | null; endDate: string | null };
}
export interface DocumentFull extends DocumentMeta { contentJson: unknown; contentMd: string; }
export interface Template {
  id: string; type: DocType; name: string; description: string;
  bodyJson: unknown; bodyMd: string; promptHints: string;
  isDefault: boolean; archivedAt: string | null;
  createdBy: string | null; createdAt: string; updatedAt: string;
}
export interface FeatureWithDocs extends Feature { documents: DocumentMeta[]; }
export interface Comment {
  id: string; authorId: string; authorName: string; authorColor: string;
  featureId: string | null; documentId: string | null; parentId: string | null;
  body: string; resolvedAt: string | null; resolvedBy: string | null;
  createdAt: string; updatedAt: string;
}
export interface CommentThread extends Comment { replies: Comment[]; }
export type AttentionItem =
  | { kind: 'open_comments'; featureId: string; title: string; count: number }
  | { kind: 'draft_doc' | 'in_review_doc'; documentId: string; featureId: string; title: string; docType: DocType }
  | { kind: 'missing_dates' | 'no_docs'; featureId: string; title: string };
export interface OverviewResponse {
  product: Product;
  features: FeatureWithDocs[];
  attention: AttentionItem[];
}

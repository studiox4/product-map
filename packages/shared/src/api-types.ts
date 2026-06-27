import type {
  Horizon, FeatureStatus, DocType, DocStatus, ActivityKind,
  IdeaStatus, EvidenceKind, ReleaseStatus, FeatureSize,
  ObjectiveStatus, PlanStatus, MemberRoleConst, NotificationKind,
} from './constants';

export interface Project { id: string; name: string; slug: string; vision: string; aboutMd: string; }
export type MemberRole = MemberRoleConst;
export interface Membership { userId: string; projectId: string; role: MemberRole; createdAt: string; }
export interface User { id: string; name: string; color: string; role: 'admin' | 'member'; createdAt?: string; }
export type VoteValue = 1 | -1;
export interface VoteSummary { score: number; boosts: number; cools: number; myVote: VoteValue | 0; }
export interface Feature extends VoteSummary {
  id: string; projectId: string; title: string; horizon: Horizon; status: FeatureStatus;
  startDate: string | null; endDate: string | null; sortOrder: number;
  descriptionMd: string;
  /** T-shirt size for capacity math (SIZE_WEEKS heuristic); null = unsized. */
  size: FeatureSize | null;
  riskMd: string;
  objectiveId: string | null;
  releaseId: string | null;
  createdBy: string | null; updatedBy: string | null;
  createdAt: string; updatedAt: string;
}
export interface DocumentMeta {
  id: string;
  /** Owning feature; null for idea-owned (pre-promotion) and release_notes docs. */
  featureId: string | null;
  /** Owning idea (idea_pitch docs); kept after promotion for provenance. */
  ideaId?: string | null;
  type: DocType; title: string; status: DocStatus;
  /** Curated gradient cover key; null/absent = no cover. Always present in API responses. */
  cover?: string | null;
  createdBy: string | null; updatedBy: string | null;
  createdAt: string; updatedAt: string;
}
// --- docs-library owner labels (ideas/docs API agent) ---
/** Owning surface of a doc in the docs library: feature, idea, or release. */
export interface DocOwnerLabel { kind: 'feature' | 'idea' | 'release'; id: string; title: string; }
export interface DocumentListItem extends DocumentMeta {
  /** '' for idea-owned and release_notes docs (no owning feature). */
  featureTitle: string;
  /** Null for idea-owned and release_notes docs. */
  featureHorizon: Horizon | null;
  wordCount: number;
  /**
   * Owning surface chip target. Always present in API responses (optional here
   * like `cover` so existing fixtures keep compiling); null only for orphaned
   * release_notes docs whose release was deleted.
   */
  ownerLabel?: DocOwnerLabel | null;
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
export interface FeatureWithDocs extends Feature {
  documents: DocumentMeta[];
  /**
   * Dependency choice (board "blocked" badge): we expose `blockerIds` — the ids
   * of features that block this one — rather than a precomputed blockedCount.
   * The board already holds every feature in memory, so the client derives the
   * amber badge by checking whether any blocker in the loaded list is unshipped
   * (and clears it live when a blocker ships). Populated by GET /api/features
   * and GET /api/features/:id; optional because other FeatureWithDocs producers
   * (e.g. /api/overview) don't need it.
   */
  blockerIds?: string[];
}
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
  project: Project;
  features: FeatureWithDocs[];
  attention: AttentionItem[];
}

// --- Dream tier (D1–D9) resources ---
export interface Idea {
  id: string; title: string; bodyMd: string; source: string; status: IdeaStatus;
  promotedFeatureId: string | null; createdBy: string | null;
  createdAt: string; updatedAt: string;
  /** Joined creator (GET /api/ideas); null when the creator was deleted. */
  creator?: { id: string; name: string; color: string } | null;
  /** Pitch doc meta when one exists (idea_pitch document owned by this idea). */
  pitchDoc?: { id: string; title: string; status: DocStatus } | null;
}
/** Idea list/detail rows carry their vote summary (same pill UI as the board). */
export interface IdeaWithVotes extends Idea { score: number; boosts: number; cools: number; myVote: VoteValue | 0; }
export interface Evidence {
  id: string; featureId: string; kind: EvidenceKind; title: string;
  bodyMd: string; sourceUrl: string; weight: number;
  createdBy: string | null; createdAt: string;
}
export interface Decision {
  id: string; featureId: string | null; title: string; decisionMd: string;
  alternativesMd: string; sourceCommentId: string | null;
  decidedBy: string | null; decidedAt: string; createdAt: string;
  /** Joined from users for the decision card avatar; null when decider deleted. */
  decidedByName?: string | null; decidedByColor?: string | null;
}
/** AI thread → decision suggestion (POST /api/ai/suggest-decision). */
export interface SuggestDecisionResponse {
  suggested: boolean; title: string; decisionMd: string; alternativesMd: string;
}
/** GET /api/features/:id/dependencies */
export interface FeatureDependencies { blockers: Feature[]; blocked: Feature[]; }
export interface Release {
  id: string; name: string; targetDate: string | null; status: ReleaseStatus;
  /** Full-doc release notes (release_notes document); null until created. */
  notesDocId: string | null;
  shippedAt: string | null; createdAt: string;
}
export interface Objective {
  id: string; title: string; descriptionMd: string;
  metric: string; target: string; current: string;
  status: ObjectiveStatus; ownerId: string | null; quarter: string; createdAt: string;
  /** Joined owner (GET /api/objectives); null when unowned or owner deleted. */
  owner?: { name: string; color: string } | null;
  /** Count of features assigned to this objective (GET /api/objectives). */
  featureCount?: number;
}
// --- Roadmap scenario plans ---
export interface Plan {
  id: string; name: string; status: PlanStatus;
  createdBy: string | null; appliedAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface PlanEntry {
  planId: string; featureId: string;
  startDate: string | null; endDate: string | null; horizon: Horizon;
}
/** GET /api/plans/:id and POST /api/plans responses carry the snapshot. */
export interface PlanWithEntries extends Plan { entries: PlanEntry[]; }
/** POST /api/plans/:id/apply — diff summary of what changed on the real roadmap. */
export interface PlanApplyResult {
  plan: Plan;
  changed: Array<{
    featureId: string; title: string;
    fields: Partial<Record<'startDate' | 'endDate' | 'horizon', { from: string | null; to: string | null }>>;
  }>;
}
export interface Invite {
  token: string;
  projectId: string;
  role: MemberRole;
  email: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}
/** Public-safe preview returned by GET /api/invites/:token (no token internals leaked / no PII). */
export interface InvitePreview {
  projectId: string;
  projectName: string;
  role: MemberRole;
  expired: boolean;
}

export interface ShareTokenInfo {
  id: string; token: string; kind: string; createdAt: string; revokedAt: string | null;
}
/** Which sections a public share link exposes. */
export interface ShareSections { roadmap: boolean; board: boolean; changelog: boolean; }
export const ALL_SHARE_SECTIONS: ShareSections = { roadmap: true, board: true, changelog: true };
/** GET /api/share/:token/data — read-only, no auth. */
export interface ShareData {
  project: Project;
  features: FeatureWithDocs[];
  releases: Release[];
  sections: ShareSections;
}
/** POST /api/projects/:id/share/roadmap response. */
export interface ShareMintResult { url: string; sections: ShareSections; expiresAt: string | null; }

/** E5 public idea intake configuration. */
export interface IntakeConfig {
  introMd: string;
  moderation: boolean;
}
/** POST /api/projects/:id/intake/mint response. */
export interface IntakeMintResult {
  url: string;
  expiresAt: string | null;
}
/** GET /api/intake/:token/meta — public-safe metadata for the intake form. */
export interface IntakeMeta {
  projectName: string;
  introMd: string;
  active: true;
}

/** GET /api/copilot/nudges — derived hygiene prompts, no table behind them. */
export type CopilotNudge =
  | { kind: 'stale_draft'; documentId: string; featureId: string; title: string; updatedAt: string }
  | { kind: 'dateless_now'; featureId: string; title: string }
  | { kind: 'oversized'; featureId: string; title: string }
  | { kind: 'stale_thread'; commentId: string; featureId: string | null; documentId: string | null; title: string; createdAt: string };

// --- E3 Dashboard (GET /api/dashboard) — user-scoped, cross-project home ---
/** One project the caller is a member of or has favorited, with status rollup. */
export interface DashboardProject {
  id: string; name: string; slug: string;
  role: MemberRole; favorite: boolean;
  counts: { idea: number; planned: number; in_progress: number; shipped: number };
  nextRelease: { id: string; name: string; date: string | null } | null;
  /** Features overdue (endDate < today) and not yet shipped — a v1 heuristic. */
  staleCount: number;
}
/** "What should I act on next?" — derived from existing signals (no notifications yet). */
export type NextAction =
  | { kind: 'open_comment'; source: 'authored' | 'collaborating'; projectId: string; projectSlug: string; featureId?: string; documentId?: string; title: string; count: number }
  | { kind: 'doc_in_review'; projectId: string; projectSlug: string; documentId: string; featureId: string; title: string; docType: DocType }
  | { kind: 'feature_missing_dates'; projectId: string; projectSlug: string; featureId: string; title: string };
/** A feature the caller collaborates on, across projects. */
export interface MyWorkItem {
  featureId: string; projectId: string; projectSlug: string;
  title: string; status: FeatureStatus; horizon: Horizon;
}
/** Cross-project activity row — workspace row plus its project scope. */
export interface DashboardActivityItem extends WorkspaceActivityItem { projectId: string; projectSlug: string; }
/** Full payload of GET /api/dashboard. */
export interface DashboardResponse {
  projects: DashboardProject[];
  nextActions: NextAction[];
  myWork: MyWorkItem[];
  activity: DashboardActivityItem[];
}

// --- E2a In-app notifications ---
export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  projectId: string;
  projectSlug: string;
  actorId: string | null;
  actorName: string | null;
  actorColor: string | null;
  featureId: string | null;
  documentId: string | null;
  commentId: string | null;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export type NotificationPrefs = Record<NotificationKind, boolean>;

export interface UnreadCount {
  count: number;
}

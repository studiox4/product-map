export const HORIZONS = ['now', 'next', 'later'] as const;
export type Horizon = (typeof HORIZONS)[number];
export const FEATURE_STATUSES = ['idea', 'planned', 'in_progress', 'shipped'] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];
export const DOC_TYPES = ['prd', 'brd', 'tech_spec', 'feature_brief', 'idea_pitch', 'release_notes'] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_STATUSES = ['draft', 'in_review', 'final'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];
export const IDEA_STATUSES = ['inbox', 'triaged', 'promoted', 'archived'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];
export const EVIDENCE_KINDS = ['quote', 'research', 'ticket', 'metric', 'other'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const RELEASE_STATUSES = ['planned', 'shipped'] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];
export const FEATURE_SIZES = ['s', 'm', 'l'] as const;
export type FeatureSize = (typeof FEATURE_SIZES)[number];
export const OBJECTIVE_STATUSES = ['on_track', 'at_risk', 'achieved', 'dropped'] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];
export const PLAN_STATUSES = ['draft', 'applied', 'archived'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
// Capacity heuristic (D6): estimated weeks of work per feature size.
export const SIZE_WEEKS: Record<FeatureSize, number> = { s: 1, m: 3, l: 6 };

// Badge/chip tints are theme-aware CSS variables (see apps/web/src/index.css);
// bar hexes stay fixed — they read on both light and dark fields.
export const HORIZON_COLORS: Record<Horizon, { badge: string; bar: string; header: string }> = {
  now:   { badge: 'bg-sage-soft text-sage', bar: '#16a34a', header: 'border-green-600' },
  next:  { badge: 'bg-warm-soft text-warm', bar: '#f59e0b', header: 'border-amber-500' },
  later: { badge: 'bg-[var(--pm-violet-soft)] text-[var(--pm-violet)]', bar: '#6366f1', header: 'border-indigo-500' },
};
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  prd: 'PRD', brd: 'BRD', tech_spec: 'Tech spec', feature_brief: 'Feature brief',
  idea_pitch: 'Idea pitch', release_notes: 'Release notes',
};

export const ACTIVITY_KINDS = [
  'feature_created', 'horizon_changed', 'status_changed', 'dates_changed',
  'description_edited', 'doc_created', 'doc_status_changed', 'doc_renamed',
  'comment_added', 'comment_resolved',
  'idea_promoted', 'decision_logged', 'dependency_added', 'dependency_removed',
  'release_shipped', 'size_changed',
  'idea_edited', 'plan_applied', 'release_status_changed',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const DOC_TYPE_COLORS: Record<DocType, { chip: string; edge: string }> = {
  prd:           { chip: 'bg-action-soft text-action', edge: '#2b557e' },
  tech_spec:     { chip: 'bg-[var(--pm-grape-soft)] text-[var(--pm-grape)]', edge: '#6d3f9e' },
  brd:           { chip: 'bg-cool-soft text-cool', edge: '#0e7490' },
  feature_brief: { chip: 'bg-sage-soft text-sage', edge: '#3c6b46' },
  idea_pitch:    { chip: 'bg-[#fdf0e3] text-[#9a6428]', edge: '#b45309' },
  release_notes: { chip: 'bg-[#e2e8f0] text-[#475569]', edge: '#475569' },
};
export const DOC_STATUS_COLORS: Record<DocStatus, string> = {
  draft:     'bg-wash text-body-ink',
  in_review: 'bg-warm-soft text-warm',
  final:     'bg-sage-soft text-sage',
};
export const USER_COLORS = ['#2b557e', '#3c6b46', '#9a6428', '#6d3f9e', '#0e7490', '#9a5a3c']; // assigned round-robin

/** Minimum password length, enforced in shared schemas and reused on the client. */
export const MIN_PASSWORD_LENGTH = 10;

/** Project role hierarchy — higher rank ⊇ lower rank's capabilities. */
export const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 } as const;

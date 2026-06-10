export const HORIZONS = ['now', 'next', 'later'] as const;
export type Horizon = (typeof HORIZONS)[number];
export const FEATURE_STATUSES = ['idea', 'planned', 'in_progress', 'shipped'] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];
export const DOC_TYPES = ['prd', 'brd', 'tech_spec', 'feature_brief'] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_STATUSES = ['draft', 'in_review', 'final'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const HORIZON_COLORS: Record<Horizon, { badge: string; bar: string; header: string }> = {
  now:   { badge: 'bg-[#e4f0e4] text-[#3c6b46]', bar: '#16a34a', header: 'border-green-600' },
  next:  { badge: 'bg-[#fdf0e3] text-[#9a6428]', bar: '#f59e0b', header: 'border-amber-500' },
  later: { badge: 'bg-[#e8eafb] text-[#4b51a8]', bar: '#6366f1', header: 'border-indigo-500' },
};
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  prd: 'PRD', brd: 'BRD', tech_spec: 'Tech spec', feature_brief: 'Feature brief',
};

export const ACTIVITY_KINDS = [
  'feature_created', 'horizon_changed', 'status_changed', 'dates_changed',
  'description_edited', 'doc_created', 'doc_status_changed', 'doc_renamed',
  'comment_added', 'comment_resolved',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const DOC_TYPE_COLORS: Record<DocType, { chip: string; edge: string }> = {
  prd:           { chip: 'bg-[#dcebff] text-[#2b557e]', edge: '#2b557e' },
  tech_spec:     { chip: 'bg-[#efe3fb] text-[#6d3f9e]', edge: '#6d3f9e' },
  brd:           { chip: 'bg-[#d9f2f0] text-[#0e7490]', edge: '#0e7490' },
  feature_brief: { chip: 'bg-[#e4f0e4] text-[#3c6b46]', edge: '#3c6b46' },
};
export const DOC_STATUS_COLORS: Record<DocStatus, string> = {
  draft:     'bg-[#f1f3f5] text-[#5a6b80]',
  in_review: 'bg-[#fdf0e3] text-[#9a6428]',
  final:     'bg-[#e4f0e4] text-[#3c6b46]',
};
export const USER_COLORS = ['#2b557e', '#3c6b46', '#9a6428', '#6d3f9e', '#0e7490', '#9a5a3c']; // assigned round-robin

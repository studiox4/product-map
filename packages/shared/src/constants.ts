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

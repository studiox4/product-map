export const HORIZONS = ['now', 'next', 'later'] as const;
export type Horizon = (typeof HORIZONS)[number];
export const FEATURE_STATUSES = ['idea', 'planned', 'in_progress', 'shipped'] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];
export const DOC_TYPES = ['prd', 'brd', 'tech_spec', 'feature_brief'] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_STATUSES = ['draft', 'in_review', 'final'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const HORIZON_COLORS: Record<Horizon, { badge: string; bar: string; header: string }> = {
  now:   { badge: 'bg-green-100 text-green-800',   bar: '#16a34a', header: 'border-green-600' },
  next:  { badge: 'bg-amber-100 text-amber-800',   bar: '#f59e0b', header: 'border-amber-500' },
  later: { badge: 'bg-indigo-100 text-indigo-800', bar: '#6366f1', header: 'border-indigo-500' },
};
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  prd: 'PRD', brd: 'BRD', tech_spec: 'Tech spec', feature_brief: 'Feature brief',
};

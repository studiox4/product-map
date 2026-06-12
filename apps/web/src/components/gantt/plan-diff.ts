import type { Feature, PlanEntry } from '@productmap/shared';

export type PlanDiffField = 'startDate' | 'endDate' | 'horizon';

export interface PlanDiffItem {
  featureId: string;
  title: string;
  fields: Partial<Record<PlanDiffField, { from: string | null; to: string | null }>>;
}

/**
 * Client-side preview of POST /api/plans/:id/apply — mirrors the server's
 * per-feature field diff so the confirm dialog can list exactly what will
 * change before anything is written. Entries whose feature no longer exists
 * (deleted since the snapshot) are skipped, matching the server's inner join.
 */
export function computePlanDiff(features: Feature[], entries: PlanEntry[]): PlanDiffItem[] {
  const byId = new Map(features.map((f) => [f.id, f]));
  const changed: PlanDiffItem[] = [];
  for (const entry of entries) {
    const feature = byId.get(entry.featureId);
    if (!feature) continue;
    const fields: PlanDiffItem['fields'] = {};
    if (entry.startDate !== feature.startDate) {
      fields.startDate = { from: feature.startDate, to: entry.startDate };
    }
    if (entry.endDate !== feature.endDate) {
      fields.endDate = { from: feature.endDate, to: entry.endDate };
    }
    if (entry.horizon !== feature.horizon) {
      fields.horizon = { from: feature.horizon, to: entry.horizon };
    }
    if (Object.keys(fields).length > 0) {
      changed.push({ featureId: feature.id, title: feature.title, fields });
    }
  }
  return changed.sort((a, b) => a.title.localeCompare(b.title));
}

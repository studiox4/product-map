import { z } from 'zod';
import { HORIZONS, FEATURE_STATUSES, DOC_TYPES, DOC_STATUSES } from './constants';

export const featureCreate = z.object({
  title: z.string().min(1).max(200),
  horizon: z.enum(HORIZONS),
});
export const featureUpdate = z.object({
  title: z.string().min(1).max(200).optional(),
  horizon: z.enum(HORIZONS).optional(),
  status: z.enum(FEATURE_STATUSES).optional(),
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  sortOrder: z.number().int().optional(),
}).refine(d => !(d.startDate && d.endDate) || d.startDate <= d.endDate,
  { message: 'startDate must be on or before endDate' });
export const documentCreate = z.object({
  featureId: z.string().uuid(),
  type: z.enum(DOC_TYPES),
  title: z.string().min(1).max(200),
  fromTemplate: z.boolean().default(true),
});
export const documentUpdate = z.object({
  title: z.string().min(1).max(200).optional(),
  contentJson: z.record(z.unknown()).optional(),  // Tiptap doc JSON
  status: z.enum(DOC_STATUSES).optional(),
});
export const productUpdate = z.object({
  name: z.string().min(1).optional(),
  vision: z.string().optional(),
  aboutMd: z.string().optional(),
});
export const generateDoc = z.object({
  docType: z.enum(DOC_TYPES),
  featureId: z.string().uuid(),
  brief: z.string().min(1).max(2000),
});

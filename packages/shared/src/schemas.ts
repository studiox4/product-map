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
  descriptionMd: z.string().optional(),
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
  cover: z.string().min(1).max(120).nullable().optional(),  // curated gradient key
});
export const productUpdate = z.object({
  name: z.string().min(1).optional(),
  vision: z.string().optional(),
  aboutMd: z.string().optional(),
});
export const userCreate = z.object({
  name: z.string().min(1).max(80),
});
export const userUpdate = z.object({
  name: z.string().min(1).max(80).optional(),
});
export const collaboratorsPut = z.object({
  userIds: z.array(z.string().uuid()),
});
export const commentCreate = z.object({
  featureId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  body: z.string().min(1).max(4000),
}).refine(d => (d.featureId !== undefined) !== (d.documentId !== undefined),
  { message: 'exactly one of featureId or documentId is required' });
export const commentUpdate = z.object({
  body: z.string().min(1).max(4000).optional(),
});
export const resolveBody = z.object({
  resolved: z.boolean(),
});
export const voteBody = z.object({
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});
export const generateDoc = z.object({
  docType: z.enum(DOC_TYPES),
  featureId: z.string().uuid(),
  brief: z.string().min(1).max(2000),
});

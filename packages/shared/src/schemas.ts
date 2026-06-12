import { z } from 'zod';
import {
  HORIZONS, FEATURE_STATUSES, DOC_TYPES, DOC_STATUSES,
  IDEA_STATUSES, EVIDENCE_KINDS, FEATURE_SIZES,
} from './constants';

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
  size: z.enum(FEATURE_SIZES).nullable().optional(),
  riskMd: z.string().max(20000).optional(),
  objectiveId: z.string().uuid().nullable().optional(),
  releaseId: z.string().uuid().nullable().optional(),
}).refine(d => !(d.startDate && d.endDate) || d.startDate <= d.endDate,
  { message: 'startDate must be on or before endDate' });
export const documentCreate = z.object({
  featureId: z.string().uuid(),
  type: z.enum(DOC_TYPES),
  title: z.string().min(1).max(200),
  fromTemplate: z.boolean().default(true),
  templateId: z.string().uuid().optional(),
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
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
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
export const templateCreate = z.object({
  type: z.enum(DOC_TYPES),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  bodyJson: z.record(z.unknown()).optional(),  // Tiptap doc JSON; empty body allowed
  promptHints: z.string().max(4000).optional(),
});
export const templateUpdate = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  bodyJson: z.record(z.unknown()).optional(),  // server derives body_md
  promptHints: z.string().max(4000).optional(),
});
export const archiveBody = z.object({
  archived: z.boolean(),
});
export const generateDoc = z.object({
  docType: z.enum(DOC_TYPES),
  featureId: z.string().uuid(),
  brief: z.string().min(1).max(2000),
});

// --- Dream tier (D1–D9) bodies ---
export const ideaCreate = z.object({
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(20000).optional(),
  source: z.string().max(200).optional(),
});
export const ideaUpdate = z.object({
  title: z.string().min(1).max(200).optional(),
  bodyMd: z.string().max(20000).optional(),
  source: z.string().max(200).optional(),
  status: z.enum(IDEA_STATUSES).optional(),
});
/** PUT /api/ideas/:id/vote — same contract as feature votes (0 clears). */
export const ideaVoteBody = voteBody;
export const ideaPromote = z.object({
  horizon: z.enum(HORIZONS),
  withAiBrief: z.boolean().optional().default(false),
});
export const evidenceCreate = z.object({
  kind: z.enum(EVIDENCE_KINDS),
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(20000).optional(),
  sourceUrl: z.string().max(2000).optional(),
  weight: z.number().int().min(1).max(100000).optional(),
});
export const decisionCreate = z.object({
  featureId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  decisionMd: z.string().min(1).max(20000),
  alternativesMd: z.string().max(20000).optional(),
  sourceCommentId: z.string().uuid().optional(),
});
export const suggestDecisionBody = z.object({
  commentId: z.string().uuid(),
});
export const dependenciesPut = z.object({
  blockerIds: z.array(z.string().uuid()),
});
export const releaseCreate = z.object({
  name: z.string().min(1).max(200),
  targetDate: z.string().date().nullable().optional(),
  notesMd: z.string().max(50000).optional(),
});
export const releaseUpdate = z.object({
  name: z.string().min(1).max(200).optional(),
  targetDate: z.string().date().nullable().optional(),
  notesMd: z.string().max(50000).optional(),
});
export const objectiveCreate = z.object({
  title: z.string().min(1).max(200),
  metric: z.string().max(200).optional(),
  target: z.string().max(200).optional(),
  quarter: z.string().max(40).optional(),
});
export const objectiveUpdate = z.object({
  title: z.string().min(1).max(200).optional(),
  metric: z.string().max(200).optional(),
  target: z.string().max(200).optional(),
  quarter: z.string().max(40).optional(),
});
export const reviewDocBody = z.object({
  documentId: z.string().uuid(),
});
export const copilotChatBody = z.object({
  question: z.string().min(1).max(2000),
});

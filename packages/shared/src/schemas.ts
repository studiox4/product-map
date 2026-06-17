import { z } from 'zod';
import {
  HORIZONS, FEATURE_STATUSES, DOC_TYPES, DOC_STATUSES,
  IDEA_STATUSES, EVIDENCE_KINDS, FEATURE_SIZES,
  RELEASE_STATUSES, OBJECTIVE_STATUSES, MIN_PASSWORD_LENGTH,
  MEMBER_ROLES,
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
export const projectUpdate = z.object({
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
}).refine(
  // reply (parentId present): must NOT carry featureId/documentId
  // root (parentId absent): exactly one of featureId/documentId required
  (d) => d.parentId !== undefined
    ? (d.featureId === undefined && d.documentId === undefined)
    : ((d.featureId !== undefined) !== (d.documentId !== undefined)),
  { message: 'reply uses parentId only; root needs exactly one of featureId/documentId' },
);
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
});
/** PATCH /api/releases/:id — status moves BOTH ways (shipped→planned clears shippedAt). */
export const releaseUpdate = z.object({
  name: z.string().min(1).max(200).optional(),
  targetDate: z.string().date().nullable().optional(),
  status: z.enum(RELEASE_STATUSES).optional(),
});
/** PUT /api/releases/:id/features — replace-set membership. */
export const releaseFeaturesPut = z.object({
  featureIds: z.array(z.string().uuid()),
});
export const objectiveCreate = z.object({
  title: z.string().min(1).max(200),
  descriptionMd: z.string().max(20000).optional(),
  metric: z.string().max(200).optional(),
  target: z.string().max(200).optional(),
  current: z.string().max(200).optional(),
  status: z.enum(OBJECTIVE_STATUSES).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  quarter: z.string().max(40).optional(),
});
export const objectiveUpdate = z.object({
  title: z.string().min(1).max(200).optional(),
  descriptionMd: z.string().max(20000).optional(),
  metric: z.string().max(200).optional(),
  target: z.string().max(200).optional(),
  current: z.string().max(200).optional(),
  status: z.enum(OBJECTIVE_STATUSES).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  quarter: z.string().max(40).optional(),
});
// --- Roadmap scenario plans ---
/** POST /api/plans — snapshot the current schedule (or another plan) into entries. */
export const planCreate = z.object({
  name: z.string().min(1).max(200),
  copyFrom: z.union([z.literal('current'), z.string().uuid()]).default('current'),
});
export const planUpdate = z.object({
  name: z.string().min(1).max(200).optional(),
});
/** PUT /api/plans/:id/entries/:featureId — scenario editing, plan_entries only. */
export const planEntryUpdate = z.object({
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  horizon: z.enum(HORIZONS).optional(),
}).refine(d => !(d.startDate && d.endDate) || d.startDate <= d.endDate,
  { message: 'startDate must be on or before endDate' });
export const reviewDocBody = z.object({
  documentId: z.string().uuid(),
});
export const copilotChatBody = z.object({
  question: z.string().min(1).max(2000),
});

// --- Auth schemas ---
const password = z.string().min(MIN_PASSWORD_LENGTH).max(200);
const email = z.string().email().max(320).transform((s) => s.toLowerCase());

export const registerInput = z.object({
  email,
  name: z.string().min(1).max(80),
  password,
});

export const loginInput = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export const adminCreateUserInput = z.object({
  email,
  name: z.string().min(1).max(80),
  role: z.enum(['admin', 'member']).default('member'),
});

export const adminUpdateUserInput = z.object({
  role: z.enum(['admin', 'member']).optional(),
  isActive: z.boolean().optional(),
  resetPassword: z.boolean().optional(),
});

export const projectCreate = z.object({
  name: z.string().min(1).max(120),
  vision: z.string().max(2000).optional(),
  aboutMd: z.string().max(20000).optional(),
});

const role = z.enum(MEMBER_ROLES);

export const memberAdd = z
  .object({
    userId: z.string().uuid().optional(),
    email: z.string().email().optional(),
    role: role.default('editor'),
  })
  .refine((v) => !!v.userId || !!v.email, { message: 'userId or email required' });

export const memberUpdate = z.object({ role });

export const inviteCreate = z.object({
  role: z.enum(['owner', 'editor', 'viewer']).default('editor'),
  email: z.string().email().optional(),
});

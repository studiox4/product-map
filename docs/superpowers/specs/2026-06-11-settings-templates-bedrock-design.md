# Settings, Template Manager & Bedrock AI — Design Addendum

**Date:** 2026-06-11 · **Extends:** all prior specs. Soft Studio + UX guidelines binding.

## Templates move to the database

`templates` table:
```
id uuid pk, type doc_type NOT NULL, name text NOT NULL, description text NOT NULL DEFAULT '',
body_json jsonb NOT NULL,            -- Tiptap doc (edited in our editor)
body_md text NOT NULL,               -- derived server-side on save (same pipeline as documents)
prompt_hints text NOT NULL DEFAULT '',
is_default boolean NOT NULL DEFAULT false,   -- exactly one default per type (partial unique index on (type) where is_default)
archived_at timestamptz NULL,
created_by uuid FK users NULL, created_at, updated_at
```
- Migration seeds the 4 built-ins from `packages/templates` (markdownBody → body_json via markdownToTiptap; `{{title}}` placeholder preserved as literal text), each `is_default = true` for its type. `packages/templates` remains ONLY as seed source.
- Doc creation: `documentCreate` gains optional `templateId uuid`. Resolution: explicit templateId → that template; else default template for `type`; `fromTemplate:false` → blank. Body copied with `{{title}}` replaced. AI generation reads `prompt_hints` + `body_md` from the resolved DB template (no longer from the package).
- Archive, not delete (docs copied content, so delete is safe — but archive keeps history simple; archived templates hidden from pickers, restorable). Deleting allowed only for non-default, never-used custom templates? NO — keep it simple: archive only.

**API**
```
GET    /api/templates?type=&includeArchived=   → Template[] (defaults first, then name)
POST   /api/templates        {type, name, description?, bodyJson?, promptHints?}  → Template (201; empty body allowed)
PATCH  /api/templates/:id    {name?, description?, bodyJson?, promptHints?}       → Template (server derives body_md)
POST   /api/templates/:id/duplicate            → Template (name + " copy")
POST   /api/templates/:id/default              → 204 (swaps default within its type, transactional)
POST   /api/templates/:id/archive {archived: boolean} → Template
```
Activity: none (templates are workspace config, not roadmap events). zod schemas in shared. Archived default cannot happen (archiving a default → 400 "set another default first").

## Settings section

Route `/settings` (+ `/settings/templates/:id` for the template editor). Nav: gear icon button right of theme toggle. Layout: left pill tab rail (Templates / Workspace / Profile), content card right. ⌘K gains "Settings" nav entries.

**Templates tab** — groups by doc type (header: DocTypeChip + count). Rows: name, description, "Default" sage pill, updated-ago, actions (Edit, Duplicate, Set default, Archive) in ⋯ menu. "New template" per group → inline name input + create → editor. Archived collapsed under toggle. Template editor page: same Tiptap editor chrome as docs (slash menu etc), fields above: name, description, promptHints (textarea, labeled "AI drafting hints"), type chip fixed. Autosave like docs. Note card: "Use {{title}} where the document title should appear."

**Workspace tab** — product name + vision inputs (PATCH product), "Export workspace" button (downloads /api/export.zip), danger zone card: "Reset demo data" (confirm dialog → POST /api/admin/reset-demo which runs truncate+seed; dev-only convenience, returns 403 when NODE_ENV=production).

**Profile tab** — name input (PATCH /api/users/:id), avatar color swatch picker from USER_COLORS (PATCH gains color), live preview avatar.

**New-doc dialog upgrade** — per-type radio list now lists that type's templates (default first, then others; description as hint) + "Blank". Sends templateId.

## AI → Vercel AI SDK on Amazon Bedrock (Bedrock only)

- Deps (api): `ai`, `@ai-sdk/amazon-bedrock`. REMOVE `@anthropic-ai/sdk`.
- `apps/api/src/lib/ai.ts` rewrite:
  ```ts
  import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
  import { streamText } from 'ai';
  // enabled when AWS auth is plausible: AWS_REGION or AWS_PROFILE or AWS_ACCESS_KEY_ID set (standard credential chain does the rest)
  // model: process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
  ```
  `streamText({ model, system, prompt })` → iterate `textStream` → existing SSE events (`chunk` {text}, `done`). **The HTTP contract is unchanged** — web code and e2e SSE mocks stay valid.
- `/api/ai/status` semantics unchanged (`{enabled}`); now reflects Bedrock credential presence. `/api/ai/generate-doc` resolves the DB template for promptHints/skeleton (accepts optional templateId too). `/api/ai/digest` same swap.
- Tests: ai.ts gets a factory seam (inject fake model via AI SDK's mock provider `ai/test` MockLanguageModelV2 or a simple injected streamText impl) — no AWS calls in CI. Integration tests assert SSE shape + prompt assembly from DB template.
- `.env.example`: replace ANTHROPIC_API_KEY with `AWS_REGION=us-east-1`, `AWS_PROFILE=` (optional), `BEDROCK_MODEL_ID=` (optional override). README AI section updated.

## Acceptance criteria

1. Settings reachable from nav gear + ⌘K; three tabs render with Soft Studio styling in both themes.
2. Template CRUD: create "Lightweight PRD" under PRD, edit body in Tiptap (slash menu works), set as default; new-doc dialog now offers both PRD templates with the new default preselected; created doc uses its body with `{{title}}` replaced.
3. Duplicate and archive work; archiving the current default is blocked with a clear error until another default is set; archived hidden from new-doc dialog.
4. Workspace tab edits product vision (landing reflects), export downloads, reset-demo restores seed (confirm-gated).
5. Profile tab renames user + changes avatar color; board/comments/activity avatars update.
6. AI doc generation works through Bedrock when AWS creds configured (manual check), streams into editor; `/api/ai/status` false without creds and all AI affordances hidden; e2e SSE mocks still pass unchanged.
7. Prompt assembly provably uses DB template prompt_hints (integration test: edit hints → next generation request contains them).
8. tsc + pnpm test + pnpm e2e green; `@anthropic-ai/sdk` no longer in any package.json.

## Out of scope
Custom doc types, template versioning/history, AI settings tab, per-template model overrides.

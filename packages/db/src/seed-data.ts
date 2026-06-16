// Demo seed data, callable both from the CLI runner (src/seed.ts) and from the
// API's POST /api/admin/reset-demo route. The markdown→Tiptap converter lives in
// apps/api/src/lib, so callers inject it (keeps this package dependency-light).
//
// The story: the ProductMap team (Corban, Priya, Marcus, Elena) has been
// dogfooding its own roadmap for ~3 months. Docs, comments, votes and the
// activity history are all written as that team would have left them.
import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';
import { TEMPLATES } from '@productmap/templates';
import {
  products,
  features,
  documents,
  users,
  featureCollaborators,
  activity,
  comments,
  votes,
  templates,
  ideas,
  ideaVotes,
  evidence,
  decisions,
  featureDependencies,
  releases,
  objectives,
  plans,
  planEntries,
  type Db,
} from './index';
import { eq } from 'drizzle-orm';

export type MarkdownToTiptap = (md: string) => unknown;

// --- date helpers: "this month" / "next month" relative to today ---
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function seedDemo(db: Db, markdownToTiptap: MarkdownToTiptap): Promise<void> {
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const thisMonth = (day: number) => iso(new Date(Date.UTC(y, m, day)));
  const nextMonth = (day: number) => iso(new Date(Date.UTC(y, m + 1, day)));
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  // Idempotent: wipe everything first.
  await db.execute(
    sql`truncate table comments, votes, activity, feature_collaborators, uploads, documents, idea_votes, ideas, evidence, decisions, feature_dependencies, share_tokens, plan_entries, plans, features, releases, objectives, products, templates, users restart identity cascade`,
  );

  // The team, in join order. Corban stays first — several code paths fall back
  // to the first-created user. Colors come from USER_COLORS in @productmap/shared.
  const [corban, priya, marcus, elena] = await db
    .insert(users)
    .values([
      { name: 'Corban', color: '#2b557e', createdAt: daysAgo(92), email: 'admin@productmap.local', role: 'admin', passwordHash: await hash('devpassword123') },
      { name: 'Priya Shah', color: '#3c6b46', createdAt: daysAgo(82) },
      { name: 'Marcus Webb', color: '#9a6428', createdAt: daysAgo(73) },
      { name: 'Elena Rodriguez', color: '#6d3f9e', createdAt: daysAgo(56) },
    ])
    .returning();

  // Built-in document templates: one default per doc type, body authored in
  // @productmap/templates as markdown ({{title}} preserved as literal text).
  await db.insert(templates).values(
    Object.values(TEMPLATES).map((t) => ({
      type: t.type,
      name: t.name,
      description: t.description,
      bodyJson: markdownToTiptap(t.markdownBody),
      bodyMd: t.markdownBody,
      promptHints: t.promptHints,
      isDefault: true,
    })),
  );

  const [product] = await db
    .insert(products)
    .values({
      name: 'ProductMap',
      vision: 'Roadmaps and docs your security team will let you run.',
      aboutMd:
        'ProductMap is a self-hosted product planning workspace: a now-next-later board, a draggable Gantt roadmap, and a rich markdown document editor with AI drafting — all backed by your own Postgres, so nothing leaves your network.',
    })
    .returning();

  const featureRows = await db
    .insert(features)
    .values([
      // Now
      {
        productId: product.id,
        title: 'Rich markdown editor',
        horizon: 'now' as const,
        status: 'in_progress' as const,
        startDate: thisMonth(1),
        endDate: thisMonth(21),
        sortOrder: 0,
        descriptionMd:
          'A Tiptap-based editor that round-trips markdown, so PRDs, specs and briefs live next to the roadmap items they describe. Tables, task lists, callouts, toggles, images and code blocks all in scope.',
        createdBy: corban.id,
        updatedBy: corban.id,
      },
      {
        productId: product.id,
        title: 'Now-next-later board',
        horizon: 'now' as const,
        status: 'in_progress' as const,
        startDate: thisMonth(8),
        endDate: thisMonth(28),
        sortOrder: 1,
        descriptionMd:
          'The default planning surface: three columns, drag-and-drop between horizons, and a score sort driven by team votes. Built to answer "what are we doing and roughly when" without dates.',
        createdBy: corban.id,
        updatedBy: priya.id,
      },
      // Next
      {
        productId: product.id,
        title: 'Gantt roadmap',
        horizon: 'next' as const,
        status: 'planned' as const,
        startDate: nextMonth(1),
        endDate: nextMonth(18),
        sortOrder: 0,
        descriptionMd:
          'An SVG timeline with draggable, resizable bars synced to feature dates, plus an unscheduled tray for dateless work. The answer to "when?" that the board cannot give.',
        createdBy: corban.id,
        updatedBy: elena.id,
      },
      {
        productId: product.id,
        title: 'AI doc drafting',
        horizon: 'next' as const,
        status: 'planned' as const,
        startDate: nextMonth(10),
        endDate: nextMonth(28),
        sortOrder: 1,
        descriptionMd:
          'One-line brief in, structured first draft out — streamed into the editor over SSE. Strictly opt-in and key-gated so self-hosters without a provider key never see a dead button.',
        createdBy: priya.id,
        updatedBy: marcus.id,
      },
      // Later — two dated (so the landing hero shows ≥6 bars per AC2), two dateless
      // (→ unscheduled tray + attention).
      {
        productId: product.id,
        title: 'Comments & review',
        horizon: 'later' as const,
        status: 'idea' as const,
        startDate: nextMonth(20),
        endDate: nextMonth(38), // Date.UTC rolls over into the following month
        sortOrder: 0,
        descriptionMd:
          'Threaded comments on features and docs with resolve/reopen, so review feedback stops living in screenshots pasted into chat.',
        createdBy: elena.id,
        updatedBy: elena.id,
      },
      {
        productId: product.id,
        title: 'Up/down voting',
        horizon: 'later' as const,
        status: 'idea' as const,
        startDate: nextMonth(32),
        endDate: nextMonth(46),
        sortOrder: 1,
        descriptionMd:
          'Lightweight 🚀/🧊 voting on features — one vote per person — feeding an optional score sort on the board. Signal, not governance.',
        createdBy: priya.id,
        updatedBy: priya.id,
      },
      {
        productId: product.id,
        title: 'Realtime collaboration (Yjs)',
        horizon: 'later' as const,
        status: 'idea' as const,
        sortOrder: 2,
        descriptionMd:
          'CRDT-backed multiplayer editing for docs via Yjs, with presence cursors. Parked until the single-player editor is rock solid.',
        createdBy: marcus.id,
        updatedBy: marcus.id,
      },
      {
        productId: product.id,
        title: 'ECS deployment',
        horizon: 'later' as const,
        status: 'idea' as const,
        sortOrder: 3,
        descriptionMd:
          'A reference Terraform module for running ProductMap on AWS ECS Fargate behind an ALB, with RDS Postgres — the path for teams who want self-hosted but not a VM to babysit.',
        createdBy: marcus.id,
        updatedBy: marcus.id,
      },
    ])
    .returning();

  const byTitle = new Map(featureRows.map((f) => [f.title, f]));
  const editor = byTitle.get('Rich markdown editor')!;
  const board = byTitle.get('Now-next-later board')!;
  const gantt = byTitle.get('Gantt roadmap')!;
  const ai = byTitle.get('AI doc drafting')!;
  const commentsFeature = byTitle.get('Comments & review')!;
  const voting = byTitle.get('Up/down voting')!;
  const realtime = byTitle.get('Realtime collaboration (Yjs)')!;
  const ecs = byTitle.get('ECS deployment')!;

  // --- documents: every feature gets at least one; flagships get 2-3.
  // contentJson is derived from contentMd via the injected converter so the
  // two representations can never drift.
  const mkDoc = (args: {
    feature: typeof editor;
    type: 'prd' | 'brd' | 'tech_spec' | 'feature_brief';
    title: string;
    status: 'draft' | 'in_review' | 'final';
    author: typeof corban;
    editedBy?: typeof corban;
    createdDaysAgo: number;
    updatedDaysAgo: number;
    md: string;
  }) => ({
    featureId: args.feature.id,
    type: args.type,
    title: args.title,
    status: args.status,
    contentJson: markdownToTiptap(args.md),
    contentMd: args.md,
    createdBy: args.author.id,
    updatedBy: (args.editedBy ?? args.author).id,
    createdAt: daysAgo(args.createdDaysAgo),
    updatedAt: daysAgo(args.updatedDaysAgo),
  });

  const editorPrdMd = `# Rich markdown editor — PRD

## Overview

A Tiptap-based editor that round-trips markdown so PMs can write PRDs, specs, and briefs without leaving ProductMap. Documents are first-class citizens of the roadmap: every doc belongs to a feature, shows up on the board card, and exports as plain markdown that survives outside the tool.

## Problem & opportunity

Product docs live in scattered tools that security teams will not approve. Notion is a non-starter for two of our three design partners; Google Docs gets blocked at the SSO layer; Confluence is approved but nobody opens it. The result is that specs live in DMs and screenshots, and the roadmap describes work nobody can find the reasoning for. A built-in editor keeps docs next to the roadmap items they describe and inside the network boundary the customer already trusts.

## Goals

- A PM can draft a complete PRD — headings, tables, task lists, images — without touching raw markdown.
- Every document exports to clean GFM markdown, byte-for-byte stable across save/load cycles.
- Autosave within 2 seconds of the last keystroke; no explicit save button anywhere.

## Requirements

| Requirement | Priority | Notes |
| --- | --- | --- |
| Headings, lists, bold/italic, links | Must | Core typing experience |
| GFM tables with header row | Must | Requirement matrices live here |
| Task lists with checkbox state | Must | Round-trips as \`- [x]\` markers |
| Fenced code blocks with language | Must | Tech specs need them |
| Inline images via upload | Must | Served from /uploads |
| Slash-command block insertion | Should | \`/table\`, \`/task\`, \`/callout\` |
| Callout and toggle blocks | Should | Serialize to portable markdown |
| Keyboard shortcuts (Cmd+B/I, link dialog) | Should | Power users skip the toolbar |
| Realtime multiplayer editing | Won't (this cut) | Tracked as its own feature |

## Success metrics

- 100% of new features ship with at least one attached doc within two weeks of launch.
- Markdown export re-imports with zero structural diffs on our 13-doc dogfood corpus.

## Open questions

- Do we block paste of raw HTML, sanitize it, or convert it best-effort?
- Should doc status (draft → in review → final) gate anything, or stay purely informational?`;

  const editorSpecMd = `# Rich markdown editor — Tech spec

## Summary

Tiptap JSON is the source of truth; markdown is derived server-side on every save via a shared extension list. The client never serializes markdown itself — that keeps one converter, one set of bugs.

> 💡 Decision (review 5/14): we keep a single extensions array in apps/api/src/lib/tiptap-extensions.ts and import it from both the converter and the tests. Any node added to the web editor without a matching server extension fails CI.

## Proposed design

Client edits Tiptap JSON and PATCHes /api/documents/:id. The API converts JSON → HTML → markdown (turndown + GFM plugin) in the same transaction, keeping content_md consistent for export and search.

\`\`\`ts
// PATCH /api/documents/:id  (abridged)
const contentMd = tiptapToMarkdown(body.contentJson);
await db.update(documents)
  .set({ contentJson: body.contentJson, contentMd, updatedBy: userId, updatedAt: now() })
  .where(eq(documents.id, id));
\`\`\`

Custom nodes serialize to portable markdown so exports survive outside ProductMap:

- **Callout** → emoji-leading blockquote, lifted back into a callout node on import.
- **Toggle** → raw details/summary HTML passthrough; renders collapsed on GitHub.
- **Task list** → GFM checkbox markers, state preserved both directions.

## Alternatives considered

1. **Markdown as source of truth, JSON derived.** Rejected: lossy for tables with merged cells and for node attrs (callout emoji, toggle open state). We would be reverse-engineering our own editor.
2. **Store both, written by the client.** Rejected: two writers drift. Marcus measured 14 divergence cases in a week of dogfooding the prototype.
3. **HTML as the stored format.** Rejected: export quality is the whole point; turndown output from arbitrary HTML is much worse than from HTML we generated ourselves.

## Performance

markdownToTiptap on the largest seed doc (~700 words, 2 tables) runs in ~6ms; the PATCH path budget is 50ms p95 including the round-trip. No caching needed yet.

## Open questions

- Do we need image resizing in the demo, or is upload + inline render enough?
- Turndown escapes underscores inside words — annoying in tech specs. Custom rule or live with it?`;

  const editorBetaMd = `# Rich markdown editor — Beta feedback summary

## Context

We put the editor in front of five design partners for two weeks. Three are PMs at security-conscious shops, two are eng leads who write the specs themselves. This summarizes what came back and what we are doing about it.

## What landed well

- **Slash menu.** Every tester found it without prompting; "feels like the tool I'm not allowed to use" came up twice, which is exactly the pitch.
- **Markdown export.** Two partners diffed exports against re-imports looking for corruption and found none. One now pipes exports into their internal wiki via cron.
- **Autosave.** Nobody asked where the save button was. One tester pulled their network cable mid-edit to see what would break; the retry behavior got an unsolicited "nice".

## What didn't

- Table editing on narrow screens is rough — column handles overlap the text below 1100px.
- Paste from Google Docs produces doubled line breaks (tracked, fix in review).
- Two testers expected Cmd+K to open a link dialog when text is selected; it opens the command palette instead. We're remapping link-on-selection.

## Punch list

- [x] Fix doubled line breaks on Google Docs paste
- [x] Link dialog on Cmd+K when a selection exists
- [x] Escape hatch: "copy as markdown" on the overflow menu
- [ ] Column drag handles usable at laptop widths
- [ ] Image captions (3 of 5 testers asked; not committed yet)

## Verdict

Ship it to the demo workspace. The remaining items are polish, not blockers — the round-trip guarantee is the moat and it held up under deliberately hostile testing.`;

  const boardPrdMd = `# Now-next-later board — PRD

## Overview

The board is the default planning surface: three columns (Now, Next, Later), drag-and-drop between them, and per-card doc chips so the plan and the thinking stay attached. It deliberately has no dates — that is the Gantt's job — because the failure mode we're designing against is the spreadsheet roadmap that promises week-level precision nobody believes.

## Problem & opportunity

Every team we interviewed keeps two roadmaps: the honest one (a whiteboard photo, a Slack canvas) and the official one (a slide nobody updates). The honest one wins because it is cheap to change. A now-next-later board is the cheapest credible structure: three buckets, strong ordering inside each, zero ceremony.

## Requirements

| Requirement | Priority | Notes |
| --- | --- | --- |
| Three fixed horizon columns | Must | Now / Next / Later, no custom columns |
| Drag between columns persists horizon | Must | Optimistic UI, fast perceived move |
| Manual sort within a column | Must | sort_order, drag to reorder |
| Card shows status, doc chips, vote score | Must | One-glance card anatomy |
| Score sort toggle (votes) | Should | Per-user preference, localStorage |
| Peek sheet on card click | Should | Edit without losing board context |
| Card cover images | Won't | Aesthetic, not planning |

## Success metrics

- Time from "we decided" to "board reflects it" under 10 seconds — measured in dogfooding, currently about 6 seconds including the drag.
- Board is the most-visited route in the workspace (it is: 41% of page views over the last month, ahead of docs at 27%).

## Decisions log

- **Why only three columns?** Custom columns turn the board into Trello, and Trello roadmaps rot. The constraint is the feature. Revisit only with strong partner evidence.
- **Why votes on cards?** Priya pushed for keeping prioritization signal visible where prioritization happens, instead of a separate "insights" page nobody opens. Cheap to render, easy to ignore.`;

  const boardBriefMd = `# Now-next-later board — Score sort brief

## Problem

Manual ordering inside a column encodes one person's opinion — usually whoever dragged last. Votes exist, but they're invisible at planning time unless you open each card. We want the board to optionally re-order itself by net vote score so weekly planning starts from the team's aggregate signal instead of from archaeology.

## Proposal

A two-state toggle in the board header: **manual** (default, today's behavior) and **score**. Score mode sorts each column by net score descending, ties broken by manual sort order so the fallback is stable and unsurprising. The choice persists per user in localStorage — it's a lens, not a shared setting, so two people can look at the same board differently without fighting.

## Why not make score the default?

Because score is a conversation input, not a decision. The team that votes 🧊 on a compliance feature still has to ship it. Manual stays the default so the board always reflects what we *decided*, with score one click away to show what we *feel*. Marcus prototyped both defaults; score-as-default caused two confused "who reordered the board?" messages in the first day.

## Scope

- [x] Net score on the card (already shipped with voting)
- [ ] Header toggle group with pressed state
- [ ] Sort comparator: score desc, then sort order asc
- [ ] localStorage persistence keyed per user

## Out of scope

Weighted votes, vote decay, quadratic anything. If score sort earns its keep we revisit; if not, it's one toggle to delete.

## Success metric

Score sort used in at least half of weekly planning sessions for a month — we'll just ask, it's four teams.`;

  const ganttBriefMd = `# Gantt roadmap — Feature brief

## Problem

Stakeholders ask "when?" and the now-next-later board cannot answer; teams export to spreadsheets that rot immediately. The honest answer is usually month-level, but the only tools that draw timelines demand day-level precision and then punish you for guessing wrong.

## Proposed solution

An SVG Gantt with draggable, resizable bars synced to feature dates, plus an unscheduled tray for dateless work. Bars are colored by horizon so the board and the timeline tell the same story in different projections. Dragging a bar moves both dates; dragging its right edge changes only the end date; dragging a tray chip onto the timeline schedules it with a default two-week duration.

## Why this shape

- **Direct manipulation over forms.** Date pickers are where scheduling intent goes to die. If the answer to "can this slip two weeks?" is a quick drag, people keep the roadmap honest.
- **The tray is the backlog's waiting room.** Dateless features stay visible at the bottom instead of silently falling off the chart — undated work that disappears is how teams get surprised.
- **Month-first granularity.** Day gridlines imply a precision we don't have. Weeks can come later with a zoom control.

## Success metric

A PM can reschedule a feature in under five seconds with no page reload, and the change survives refresh. Measured in dogfooding: current median is 3.2 seconds drag-to-toast.

## Risks

- SVG hit targets on dense roadmaps — mitigated by a minimum bar height.
- Drag semantics on touch devices are deferred; this is a desktop planning surface first.`;

  const ganttSpecMd = `# Gantt roadmap — Drag interaction spec

## Summary

All bar interactions are pointer-event state machines over a single SVG; no drag library. Each interaction computes a date delta from pixel delta (4px per day at default zoom) and PATCHes the feature once on pointer-up — never during the drag.

## Interaction model

\`\`\`ts
type DragState =
  | { kind: 'idle' }
  | { kind: 'move'; featureId: string; startX: number; origin: DateRange }
  | { kind: 'resize-end'; featureId: string; startX: number; origin: DateRange }
  | { kind: 'tray'; featureId: string }; // chip → timeline drop

const PX_PER_DAY = 4;
const deltaDays = (dx: number) => Math.round(dx / PX_PER_DAY);
\`\`\`

During a drag we update only local React state, so the bar follows the pointer at 60fps with zero network chatter. On pointer-up we issue one PATCH with the final dates and show the "Moved" toast on success; on failure the bar snaps back to its origin.

<details><summary>Edge cases we explicitly handle</summary><p>Pointer leaves the SVG mid-drag (we listen on window, not the rect). Drop before the timeline origin clamps to the chart start. Resize that would produce an end before the start clamps to a one-day bar. A second pointer-down during an active drag is ignored — last writer wins is fine for a planning tool, but mid-gesture chaos is not.</p></details>

## Time Machine interplay

History mode wraps the plot in a pointer-inert, aria-disabled container, so the entire state machine above is unreachable while scrubbing. Replay is pure (see history-replay.ts) — the drag layer never needs to know history mode exists.

## Testing

- Unit: date-delta math, clamping, replay reconstruction (pure functions, no DOM).
- e2e: bar move of about a month, right-edge resize, tray-chip scheduling — all asserting persisted dates via the API, not just pixels.

## Open question

Elena wants Escape to cancel an in-flight drag. Cheap to add to the state machine; deciding whether anyone would discover it.`;

  const aiPrdMd = `# AI doc drafting — PRD

## Overview

Type a one-line brief, get a structured first draft streamed into the editor. The feature exists to kill the blank-page stall, not to write the doc for you — the draft is scaffolding the PM immediately rewrites.

> 💡 Position we keep coming back to: the AI writes the *first* 60%, the human writes the 40% that matters. Anything that blurs that line (auto-finalize, AI status changes) is out.

## Problem & opportunity

Watching partners onboard, the most common stall is a created-then-abandoned empty doc: 11 of 19 docs created in week one had zero content a day later. A template helps with structure but not with the specific feature at hand. A draft generated from the feature title, its description, and the template's prompt hints gets people editing instead of staring.

## Requirements

| Requirement | Priority | Notes |
| --- | --- | --- |
| Brief → streamed draft via SSE | Must | Tokens render as they arrive |
| Draft card only on empty docs | Must | Never offer to overwrite content |
| Key-gated affordances | Must | No key → no AI UI anywhere |
| Template prompt hints shape output | Should | Each doc type drafts differently |
| Weekly digest on the landing page | Should | Same plumbing, different prompt |
| AI edits to existing prose | Won't | Scope creep magnet — explicitly out |

## Privacy stance

Self-hosted means the customer controls the provider relationship. We send the brief, the feature title and description, and template hints — never other docs, never comments. The settings page says exactly this in one paragraph, because "what does it send?" was the first question all three security reviews asked.

## Success metrics

- Empty-doc abandonment (no content 24h after creation) drops below 20% for workspaces with AI enabled.
- Drafts are edited within 10 minutes of generation in more than 70% of uses — if people ship drafts unedited, the feature is failing at its actual job.

## Open questions

- Stream cancellation: kill the request or let it finish and discard?
- Should the digest cite which activity items it summarized?`;

  const aiSpecMd = `# AI doc drafting — Prompt pipeline spec

## Summary

One SSE endpoint, POST /api/ai/generate-doc, fronts a provider-agnostic pipeline: gather context → build prompt from the doc-type template → stream tokens → client converts the accumulated markdown to Tiptap JSON on each chunk boundary.

## Pipeline

\`\`\`ts
// apps/api/src/routes/ai.ts (abridged)
const context = {
  product: { name, vision },
  feature: { title, descriptionMd },
  docType: doc.type,
  hints: template.promptHints, // authored per template
};
const stream = provider.stream(buildPrompt(context, brief));
for await (const chunk of stream) {
  sse.send('chunk', { text: chunk });
}
sse.send('done', {});
\`\`\`

The client appends chunks to a markdown buffer and re-renders the editor from markdownToTiptap(buffer) — same converter as everywhere else, so a streamed draft is indistinguishable from a typed one by the time it autosaves.

## Provider abstraction

A single provider.stream(prompt) interface with a Bedrock implementation today. The abstraction earns its keep because two design partners can only use models already inside their cloud perimeter; adding a provider should be one file, no route changes.

## Failure modes

- **No key configured** → /api/ai/status returns enabled: false; the web app renders zero AI affordances. Tested both ways in e2e.
- **Stream dies mid-draft** → keep whatever arrived, surface a retry toast. Partial draft beats no draft.
- **Provider returns junk** → the markdown converter is already hardened against arbitrary input (it parses user paste); worst case is an ugly doc, never a crash.

## Open questions

- Token budget per draft — cap at the prompt level or truncate the stream?
- Do we log briefs for debugging? Leaning no by default with an opt-in flag, given the audience.`;

  const commentsBriefMd = `# Comments & review — Feature brief

## Problem

Review feedback on specs currently happens in chat: a screenshot, three replies, and a decision that never makes it back into the doc. Two weeks later nobody can reconstruct why the requirement changed. The doc is the artifact of record but none of the argument that shaped it lives there.

## Proposed solution

Threaded comments on both features and documents: a root comment plus one level of replies (deliberately not infinite nesting — we are not building Reddit). Threads resolve and reopen, resolved threads collapse out of the way but stay auditable, and every comment and resolve action lands in the feature's activity feed so the history reads as one story.

## Key decisions

- **One nesting level.** Feasibility argument between Elena and Marcus, settled by looking at our own chat history: 94% of spec threads were root plus direct replies. Deeper nesting buys edge-case complexity for the remaining 6%.
- **Resolve is not delete.** Resolved threads collapse under a count and expand on demand. The argument is part of the record.
- **Comments target features *or* docs, never both.** Enforced with a DB check constraint; the UI surfaces both streams on the feature page so nothing hides.

## Success metric

For features with at least one doc, more than half of doc revisions within a review cycle have an attached comment thread — i.e., the argument moved into the tool.

## Out of scope (this cut)

Inline anchored comments (selecting text to comment on a range), @-mentions with notifications, and email digests. Anchoring is the obvious next step but needs the editor's position-mapping work to land first.`;

  const votingBriefMd = `# Up/down voting — Feature brief

## Problem

Prioritization conversations start from whoever speaks loudest. We want a five-second way for anyone in the workspace to register "this matters to me" or "this can wait" *before* the meeting, so the meeting starts from data.

## Proposed solution

A 🚀 **Boost** / 🧊 **Cool** pair on every feature — card, peek sheet, and full page. One vote per person per feature, enforced by a composite primary key; clicking your active vote clears it, clicking the other side flips it. Net score feeds the board's optional score sort.

## Deliberate constraints

- **No vote counts on who.** Scores are aggregate; we show *how many*, never *which* teammates cooled your feature. Anything else turns voting into politics.
- **Votes are cheap to change.** No confirmation, instant optimistic UI, particle burst on boost because planning tools are allowed to be a little fun.
- **Score is advisory.** It sorts a view; it never gates a transition or auto-promotes a feature.

## Build checklist

- [x] votes table: (user_id, feature_id) primary key, value in {1, -1}
- [x] Vote upsert endpoint with summary response
- [x] Vote widget with pressed states and my-vote tint
- [ ] Board score sort integration (tracked in the board brief)
- [ ] Vote summary in the weekly AI digest

## Success metric

At least three distinct voters on half the backlog within a month of launch. Early dogfood signal: most features have votes from two or more people, and the score spread actually changed one planning decision — the ECS work earned a horizon discussion because Marcus kept boosting it and finally made his case.`;

  const realtimeSpecMd = `# Realtime collaboration — Yjs evaluation

## Summary

Multiplayer doc editing is the most-requested feature we have deliberately not built. This spec evaluates Yjs as the CRDT layer and recommends **wait** — the cost lands on our simplest architectural decision (server-derived markdown) and the observed demand is presence, not co-editing.

## What Yjs buys us

- Battle-tested CRDT with a first-class Tiptap binding (y-prosemirror).
- Offline edits merge instead of conflict — relevant to self-hosters on flaky VPNs.
- Awareness protocol gives us presence cursors nearly for free once the doc is shared.

## What it costs us

\`\`\`text
Today:    client JSON --PATCH--> API --> contentMd derived in-transaction
With Yjs: Y.Doc updates --ws--> y-server --debounced--> snapshot --> contentMd
\`\`\`

The markdown round-trip guarantee currently hangs off a single synchronous write path. With Yjs, "the document" becomes a live CRDT and Postgres holds snapshots; export correctness becomes eventually-consistent. We would also take on a WebSocket server (y-websocket or Hocuspocus) in a product whose pitch is "one container, your Postgres".

<details><summary>Migration sketch, if and when we commit</summary><p>Phase 1: presence only — broadcast cursors over a lightweight channel, keep PATCH writes. Phase 2: Yjs for the doc body behind a per-workspace flag, snapshot to Postgres after idle. Phase 3: remove the legacy path once the flag has been default-on for a full release. Each phase is independently shippable and reversible.</p></details>

## Recommendation

Park full co-editing; consider shipping **phase 1 (presence)** standalone — it answers "is Priya already editing this?" which is 80% of the observed pain (two people overwriting each other roughly twice a week in dogfooding). Revisit the CRDT decision when a design partner with more than 20 seats asks, because that is where simultaneous editing actually happens.

## Open questions

- Hocuspocus (batteries included) vs raw y-websocket (smaller surface)?
- Does presence justify a ws dependency alone, or can we fake it with polling?`;

  const ecsBrdMd = `# ECS deployment — Business case

## Context

Every design partner runs ProductMap from the docker-compose file today. Two of them have asked the same question in different words: "what does *supported production* look like on AWS?" This BRD makes the case for a reference ECS Fargate deployment as a first-class deliverable, not a wiki page.

## Business rationale

Self-hosted is our wedge, but "self-hosted" currently means "you own the VM, the backups and the 3am restart". That ceiling caps us at teams with platform engineers to spare. A maintained Terraform module — ALB, ECS Fargate service, RDS Postgres, S3 for uploads — turns the pitch from "you can run it" into "your cloud team approves it in a week", which is the actual procurement gate at the companies we target.

## Costs we are signing up for

| Item | Estimate | Notes |
| --- | --- | --- |
| Initial module build | ~2 eng-weeks | Terraform + GitHub Actions OIDC deploy |
| Reference monthly AWS bill | ~$95 | 2x Fargate task, db.t4g.small, ALB |
| Ongoing maintenance | ~2 days/quarter | Provider upgrades, security patches |
| Support surface | Real | "Terraform apply failed" issues will come |

## Alternatives considered

- **Helm chart first.** Half our partners have EKS, but the ones asking are the ones *without* a platform team — ECS is the lower-ops answer. Helm can follow.
- **One-click marketplace AMI.** Fastest demo, worst upgrade story; rejected.
- **Do nothing.** Keeps us a tool for hobbyist infra. The two asks came from our two largest prospects; declining both is a revenue decision, not an engineering one.

## Recommendation

Fund the two weeks. Gate GA behind one partner running the module in staging for a full upgrade cycle, so the first external user is not the guinea pig.

## Open questions

- Do uploads move to S3 in the module, or stay on an EFS mount for parity with compose?
- Is RDS multi-AZ default-on (doubles the DB line item) or a documented toggle?`;

  const docRows = await db
    .insert(documents)
    .values([
      mkDoc({ feature: editor, type: 'prd', title: 'Rich markdown editor — PRD', status: 'draft', author: corban, createdDaysAgo: 62, updatedDaysAgo: 2, md: editorPrdMd }),
      mkDoc({ feature: editor, type: 'tech_spec', title: 'Rich markdown editor — Tech spec', status: 'in_review', author: marcus, createdDaysAgo: 30, updatedDaysAgo: 4, md: editorSpecMd }),
      mkDoc({ feature: editor, type: 'feature_brief', title: 'Rich markdown editor — Beta feedback summary', status: 'final', author: priya, createdDaysAgo: 12, updatedDaysAgo: 5, md: editorBetaMd }),
      mkDoc({ feature: board, type: 'prd', title: 'Now-next-later board — PRD', status: 'final', author: priya, editedBy: corban, createdDaysAgo: 55, updatedDaysAgo: 20, md: boardPrdMd }),
      mkDoc({ feature: board, type: 'feature_brief', title: 'Now-next-later board — Score sort brief', status: 'draft', author: marcus, createdDaysAgo: 9, updatedDaysAgo: 3, md: boardBriefMd }),
      mkDoc({ feature: gantt, type: 'feature_brief', title: 'Gantt roadmap — Feature brief', status: 'final', author: corban, createdDaysAgo: 40, updatedDaysAgo: 7, md: ganttBriefMd }),
      mkDoc({ feature: gantt, type: 'tech_spec', title: 'Gantt roadmap — Drag interaction spec', status: 'in_review', author: elena, createdDaysAgo: 6, updatedDaysAgo: 1, md: ganttSpecMd }),
      mkDoc({ feature: ai, type: 'prd', title: 'AI doc drafting — PRD', status: 'in_review', author: priya, createdDaysAgo: 16, updatedDaysAgo: 6, md: aiPrdMd }),
      mkDoc({ feature: ai, type: 'tech_spec', title: 'AI doc drafting — Prompt pipeline spec', status: 'draft', author: marcus, editedBy: elena, createdDaysAgo: 8, updatedDaysAgo: 2.5, md: aiSpecMd }),
      // updatedDaysAgo > 14 on purpose: feeds the copilot stale-draft nudge (D5).
      mkDoc({ feature: commentsFeature, type: 'feature_brief', title: 'Comments & review — Feature brief', status: 'draft', author: elena, createdDaysAgo: 18, updatedDaysAgo: 16, md: commentsBriefMd }),
      mkDoc({ feature: voting, type: 'feature_brief', title: 'Up/down voting — Feature brief', status: 'draft', author: priya, createdDaysAgo: 7, updatedDaysAgo: 1.5, md: votingBriefMd }),
      mkDoc({ feature: realtime, type: 'tech_spec', title: 'Realtime collaboration — Yjs evaluation', status: 'draft', author: elena, createdDaysAgo: 5, updatedDaysAgo: 1.2, md: realtimeSpecMd }),
      mkDoc({ feature: ecs, type: 'brd', title: 'ECS deployment — Business case', status: 'in_review', author: marcus, createdDaysAgo: 8.5, updatedDaysAgo: 2.2, md: ecsBrdMd }),
    ])
    .returning();

  // --- collaborators: who actually works on what.
  await db.insert(featureCollaborators).values([
    { featureId: editor.id, userId: corban.id },
    { featureId: editor.id, userId: marcus.id },
    { featureId: editor.id, userId: priya.id },
    { featureId: board.id, userId: corban.id },
    { featureId: board.id, userId: priya.id },
    { featureId: gantt.id, userId: corban.id },
    { featureId: gantt.id, userId: elena.id },
    { featureId: ai.id, userId: priya.id },
    { featureId: ai.id, userId: marcus.id },
    { featureId: commentsFeature.id, userId: elena.id },
    { featureId: voting.id, userId: priya.id },
    { featureId: realtime.id, userId: elena.id },
    { featureId: realtime.id, userId: marcus.id },
    { featureId: ecs.id, userId: marcus.id },
  ]);

  // --- 3-month synthetic history so the roadmap Time Machine has a story to replay ---
  // Every feature is born in Later as an idea; the story promotes, schedules, and
  // staffs them until replaying all events lands exactly on the rows seeded above.
  // Geometry events (created/horizon/status/dates) chain from→to per feature so
  // backward replay is exact; doc/comment/description events are color.
  const created = (f: typeof editor, actor: typeof corban, at: Date) => ({
    featureId: f.id,
    actorId: actor.id,
    kind: 'feature_created',
    payload: {
      to: f.title,
      snapshot: { title: f.title, horizon: 'later', status: 'idea', startDate: null, endDate: null },
    },
    createdAt: at,
  });
  const docCreated = (f: typeof editor, actor: typeof corban, title: string, n: number) => ({
    featureId: f.id,
    actorId: actor.id,
    kind: 'doc_created',
    payload: { to: title },
    createdAt: daysAgo(n),
  });
  const docStatus = (f: typeof editor, actor: typeof corban, to: string, n: number) => ({
    featureId: f.id,
    actorId: actor.id,
    kind: 'doc_status_changed',
    payload: { to },
    createdAt: daysAgo(n),
  });

  await db.insert(activity).values([
    // ~12 weeks ago: the first ideas land.
    created(editor, corban, daysAgo(85)),
    created(board, corban, daysAgo(83)),
    // The editor gets serious: promoted, scheduled (roughly), then rescheduled.
    { featureId: editor.id, actorId: corban.id, kind: 'horizon_changed', payload: { from: 'later', to: 'next' }, createdAt: daysAgo(78) },
    created(gantt, corban, daysAgo(74)),
    { featureId: editor.id, actorId: corban.id, kind: 'description_edited', payload: {}, createdAt: daysAgo(71) },
    { featureId: editor.id, actorId: corban.id, kind: 'dates_changed', payload: { from: { startDate: null, endDate: null }, to: { startDate: thisMonth(5), endDate: thisMonth(25) } }, createdAt: daysAgo(70) },
    docCreated(editor, corban, 'Rich markdown editor — PRD', 62),
    { featureId: editor.id, actorId: corban.id, kind: 'status_changed', payload: { from: 'idea', to: 'planned' }, createdAt: daysAgo(60) },
    { featureId: editor.id, actorId: priya.id, kind: 'horizon_changed', payload: { from: 'next', to: 'now' }, createdAt: daysAgo(58) },
    docCreated(board, priya, 'Now-next-later board — PRD', 55.5),
    { featureId: board.id, actorId: priya.id, kind: 'horizon_changed', payload: { from: 'later', to: 'next' }, createdAt: daysAgo(55) },
    created(ai, priya, daysAgo(50)),
    // Editor dates pulled earlier — a visible bar move in the Time Machine.
    { featureId: editor.id, actorId: corban.id, kind: 'dates_changed', payload: { from: { startDate: thisMonth(5), endDate: thisMonth(25) }, to: { startDate: editor.startDate, endDate: editor.endDate } }, createdAt: daysAgo(46) },
    created(commentsFeature, elena, daysAgo(42)),
    docCreated(gantt, corban, 'Gantt roadmap — Feature brief', 40.5),
    { featureId: editor.id, actorId: marcus.id, kind: 'status_changed', payload: { from: 'planned', to: 'in_progress' }, createdAt: daysAgo(40) },
    { featureId: gantt.id, actorId: corban.id, kind: 'horizon_changed', payload: { from: 'later', to: 'next' }, createdAt: daysAgo(36) },
    created(voting, priya, daysAgo(33)),
    docCreated(editor, marcus, 'Rich markdown editor — Tech spec', 30),
    { featureId: board.id, actorId: priya.id, kind: 'status_changed', payload: { from: 'idea', to: 'planned' }, createdAt: daysAgo(29) },
    // Gantt gets rough dates first, then settles — a second visible bar move.
    { featureId: gantt.id, actorId: elena.id, kind: 'dates_changed', payload: { from: { startDate: null, endDate: null }, to: { startDate: nextMonth(5), endDate: nextMonth(22) } }, createdAt: daysAgo(28) },
    { featureId: board.id, actorId: corban.id, kind: 'horizon_changed', payload: { from: 'next', to: 'now' }, createdAt: daysAgo(24) },
    docStatus(board, corban, 'final', 20),
    created(realtime, marcus, daysAgo(18)),
    docCreated(ai, priya, 'AI doc drafting — PRD', 16),
    { featureId: ai.id, actorId: priya.id, kind: 'description_edited', payload: {}, createdAt: daysAgo(15.5) },
    { featureId: ai.id, actorId: priya.id, kind: 'horizon_changed', payload: { from: 'later', to: 'next' }, createdAt: daysAgo(15) },
    { featureId: board.id, actorId: priya.id, kind: 'dates_changed', payload: { from: { startDate: null, endDate: null }, to: { startDate: board.startDate, endDate: board.endDate } }, createdAt: daysAgo(14) },
    docCreated(editor, priya, 'Rich markdown editor — Beta feedback summary', 12.5),
    { featureId: board.id, actorId: marcus.id, kind: 'status_changed', payload: { from: 'planned', to: 'in_progress' }, createdAt: daysAgo(12) },
    { featureId: gantt.id, actorId: elena.id, kind: 'dates_changed', payload: { from: { startDate: nextMonth(5), endDate: nextMonth(22) }, to: { startDate: gantt.startDate, endDate: gantt.endDate } }, createdAt: daysAgo(11) },
    created(ecs, marcus, daysAgo(10)),
    docCreated(commentsFeature, elena, 'Comments & review — Feature brief', 10),
    { featureId: gantt.id, actorId: corban.id, kind: 'status_changed', payload: { from: 'idea', to: 'planned' }, createdAt: daysAgo(9) },
    docCreated(board, marcus, 'Now-next-later board — Score sort brief', 9),
    docCreated(ecs, marcus, 'ECS deployment — Business case', 8.5),
    { featureId: ai.id, actorId: marcus.id, kind: 'dates_changed', payload: { from: { startDate: null, endDate: null }, to: { startDate: ai.startDate, endDate: ai.endDate } }, createdAt: daysAgo(8.2) },
    docCreated(ai, marcus, 'AI doc drafting — Prompt pipeline spec', 8),
    docCreated(voting, priya, 'Up/down voting — Feature brief', 7),
    docStatus(gantt, corban, 'final', 7),
    { featureId: ai.id, actorId: priya.id, kind: 'status_changed', payload: { from: 'idea', to: 'planned' }, createdAt: daysAgo(6.5) },
    docStatus(ai, priya, 'in_review', 6),
    docCreated(gantt, elena, 'Gantt roadmap — Drag interaction spec', 6),
    docStatus(editor, priya, 'final', 5.2),
    { featureId: commentsFeature.id, actorId: elena.id, kind: 'dates_changed', payload: { from: { startDate: null, endDate: null }, to: { startDate: commentsFeature.startDate, endDate: commentsFeature.endDate } }, createdAt: daysAgo(5) },
    docCreated(realtime, elena, 'Realtime collaboration — Yjs evaluation', 5),
    { featureId: realtime.id, actorId: elena.id, kind: 'description_edited', payload: {}, createdAt: daysAgo(4.8) },
    docStatus(editor, marcus, 'in_review', 4),
    { featureId: voting.id, actorId: priya.id, kind: 'dates_changed', payload: { from: { startDate: null, endDate: null }, to: { startDate: voting.startDate, endDate: voting.endDate } }, createdAt: daysAgo(3) },
    docStatus(ecs, marcus, 'in_review', 2.2),
    { featureId: realtime.id, actorId: marcus.id, kind: 'comment_added', payload: {}, createdAt: daysAgo(2) },
    { featureId: gantt.id, actorId: marcus.id, kind: 'comment_added', payload: {}, createdAt: daysAgo(1.1) },
    { featureId: editor.id, actorId: corban.id, kind: 'comment_resolved', payload: { resolved: true }, createdAt: daysAgo(0.5) },
  ]);

  // --- comments: real team discussion across features and docs.
  // Two threads stay deliberately unresolved (editor PRD doc + Gantt feature)
  // — e2e relies on them existing.
  const docByTitle = new Map(docRows.map((d) => [d.title, d]));
  const prdDoc = docByTitle.get('Rich markdown editor — PRD')!;
  const editorSpecDoc = docByTitle.get('Rich markdown editor — Tech spec')!;
  const aiPrdDoc = docByTitle.get('AI doc drafting — PRD')!;
  const hoursAgo = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000);

  type CommentInsert = typeof comments.$inferInsert;
  const thread = async (root: CommentInsert, ...replies: CommentInsert[]) => {
    const [r] = await db
      .insert(comments)
      .values({ ...root, updatedAt: root.createdAt })
      .returning();
    for (const reply of replies) {
      await db.insert(comments).values({
        ...reply,
        featureId: root.featureId,
        documentId: root.documentId,
        parentId: r.id,
        updatedAt: reply.createdAt,
      });
    }
    return r;
  };

  // 1. UNRESOLVED — editor PRD doc (e2e depends on an open thread here).
  await thread(
    {
      authorId: corban.id,
      documentId: prdDoc.id,
      body: 'Should the requirements call out keyboard shortcuts explicitly? Slash commands alone may not cover power users.',
      createdAt: hoursAgo(20),
    },
    {
      authorId: marcus.id,
      body: 'Good catch — I bumped Cmd+B/Cmd+I and the link dialog to a Should in the table. Want them as a Must? They are basically free with Tiptap.',
      createdAt: hoursAgo(18),
    },
    {
      authorId: corban.id,
      body: 'Keep them Should for the demo cut; let’s not promise a full shortcut map before the beta punch list is empty.',
      createdAt: hoursAgo(15),
    },
  );

  // 2. UNRESOLVED — Gantt feature (e2e depends on an open thread here).
  await thread(
    {
      authorId: marcus.id,
      featureId: gantt.id,
      body: 'Do we want week or month granularity for the first cut of the timeline? Day gridlines feel like false precision for roadmap work.',
      createdAt: hoursAgo(26),
    },
    {
      authorId: corban.id,
      body: 'Month view first — weeks can land with the zoom control. Elena’s drag spec already assumes 4px/day so zoom is mostly a rendering change.',
      createdAt: hoursAgo(23),
    },
    {
      authorId: elena.id,
      body: 'Confirmed, the interaction math is zoom-agnostic. I’d still hold weeks until someone asks; nobody in dogfooding has.',
      createdAt: hoursAgo(21),
    },
  );

  // 3. RESOLVED — editor feature: tables scope question, settled.
  await thread({
    authorId: corban.id,
    featureId: editor.id,
    body: 'Confirmed: tables are in scope for the demo. Partner feedback made them a Must — requirement matrices are the #1 thing PMs paste in.',
    createdAt: hoursAgo(60),
    resolvedAt: hoursAgo(12),
    resolvedBy: corban.id,
  });

  // 4. RESOLVED — editor tech spec doc: underscore escaping debate.
  await thread(
    {
      authorId: elena.id,
      documentId: editorSpecDoc.id,
      body: 'The turndown underscore escaping (snake\\_case) is going to drive every engineer writing a spec slightly mad. Can we add the custom rule before this goes final?',
      createdAt: daysAgo(3.5),
      resolvedAt: daysAgo(1.5),
      resolvedBy: marcus.id,
    },
    {
      authorId: marcus.id,
      body: 'Agreed it’s ugly, but the naive fix corrupts intra-word emphasis. I’ve scoped a rule that only skips escaping inside code-ish tokens — landing with the next converter pass.',
      createdAt: daysAgo(3),
    },
    {
      authorId: elena.id,
      body: 'Works for me. Resolving — it’s tracked in the spec’s open questions.',
      createdAt: daysAgo(1.6),
    },
  );

  // 5. UNRESOLVED — AI PRD doc: scope pushback on the digest.
  await thread(
    {
      authorId: elena.id,
      documentId: aiPrdDoc.id,
      body: 'Pushback on the digest being a Should: it doubles the provider surface we have to test, and the draft path alone proves the privacy story. Can the digest slip to the next cut?',
      createdAt: daysAgo(4),
    },
    {
      authorId: priya.id,
      body: 'The digest reuses the exact same SSE plumbing — the marginal cost is one prompt. And it’s the only AI surface a stakeholder sees without opening a doc, which matters for the demo.',
      createdAt: daysAgo(3.7),
    },
    {
      authorId: corban.id,
      body: 'Keeping it Should, but agreeing with Elena that it ships dark if the prompt isn’t good by feature freeze. A bad digest on the landing page is worse than none.',
      createdAt: daysAgo(3.2),
    },
  );

  // 6. RESOLVED — voting feature: anonymity decision. Root kept: a seeded
  // decision links back to it (source_comment_id).
  const votingAnonRoot = await thread(
    {
      authorId: priya.id,
      featureId: voting.id,
      body: 'Are votes anonymous or attributed? If my 🧊 on someone’s pet feature shows my name, nobody will ever cool anything.',
      createdAt: daysAgo(6),
      resolvedAt: daysAgo(4.5),
      resolvedBy: priya.id,
    },
    {
      authorId: marcus.id,
      body: 'Aggregate-only. The schema stores who voted (we need it for the one-vote constraint) but the API only ever returns counts and your own vote.',
      createdAt: daysAgo(5.5),
    },
  );

  // 7. UNRESOLVED — realtime feature: feasibility debate.
  await thread(
    {
      authorId: elena.id,
      featureId: realtime.id,
      body: 'Before anyone falls in love with multiplayer cursors: Yjs makes our server-derived markdown guarantee eventually-consistent. That guarantee is the editor’s whole moat. See the evaluation doc.',
      createdAt: daysAgo(2.2),
    },
    {
      authorId: marcus.id,
      body: 'Fair, but the actual user pain is two people stomping each other’s saves, not missing co-editing. Presence-only (your phase 1) fixes that without touching the write path. Promote phase 1, park the rest.',
      createdAt: daysAgo(2),
    },
    {
      authorId: corban.id,
      body: 'Leaning the same way — presence as its own small feature next planning cycle, CRDT stays parked. Leaving this open until we slot it.',
      createdAt: daysAgo(1.8),
    },
  );

  // 8. RESOLVED — ECS feature: cost estimate sanity check.
  await thread(
    {
      authorId: corban.id,
      featureId: ecs.id,
      body: 'The ~$95/month reference bill in the BRD — is that with or without multi-AZ RDS? Procurement will quote whatever number we print.',
      createdAt: daysAgo(2.5),
      resolvedAt: daysAgo(1),
      resolvedBy: marcus.id,
    },
    {
      authorId: marcus.id,
      body: 'Single-AZ. Multi-AZ roughly doubles the DB line — call it $130 all-in. Added a footnote and left multi-AZ as a documented toggle in the open questions.',
      createdAt: daysAgo(1.2),
    },
  );

  // --- votes: spread across the team so the board score sort tells a story.
  // editor +3, ai +3, board +2, gantt +2, realtime +2, comments 0, ecs 0, voting −2.
  await db.insert(votes).values([
    { userId: corban.id, featureId: editor.id, value: 1 },
    { userId: priya.id, featureId: editor.id, value: 1 },
    { userId: marcus.id, featureId: editor.id, value: 1 },
    { userId: corban.id, featureId: ai.id, value: 1 },
    { userId: marcus.id, featureId: ai.id, value: 1 },
    { userId: elena.id, featureId: ai.id, value: 1 },
    { userId: priya.id, featureId: board.id, value: 1 },
    { userId: elena.id, featureId: board.id, value: 1 },
    { userId: elena.id, featureId: gantt.id, value: 1 },
    { userId: marcus.id, featureId: gantt.id, value: 1 },
    { userId: corban.id, featureId: realtime.id, value: 1 },
    { userId: elena.id, featureId: realtime.id, value: 1 },
    { userId: priya.id, featureId: commentsFeature.id, value: 1 },
    { userId: marcus.id, featureId: commentsFeature.id, value: -1 },
    { userId: marcus.id, featureId: ecs.id, value: 1 },
    { userId: priya.id, featureId: ecs.id, value: -1 },
    { userId: marcus.id, featureId: voting.id, value: -1 },
    { userId: elena.id, featureId: voting.id, value: -1 },
  ]);

  // --- Dream tier (D1–D9) seed additions ---

  // Objectives: two cards for /outcomes; some features stay unassigned (tray).
  const [objRecord, objSecurity] = await db
    .insert(objectives)
    .values([
      {
        title: 'Become the roadmap of record',
        descriptionMd:
          'The board, the Gantt and the docs replace the slide deck as the place stakeholders look first. We win when the question "what are we doing and when?" is answered by a link, not a meeting.',
        metric: 'Weekly active planners',
        target: '4 teams planning weekly',
        current: '2 teams planning weekly',
        status: 'on_track' as const,
        ownerId: priya.id,
        quarter: 'Q3 2026',
      },
      {
        title: 'Win security-conscious teams',
        descriptionMd:
          'Self-hosted is the wedge: pass security review at shops where Notion and Google Docs are blocked, then convert the pilot. ECS module and SSO asks both hang off this.',
        metric: 'Design partners running in prod',
        target: '3 partners',
        current: '1 partner (staging)',
        status: 'at_risk' as const,
        ownerId: marcus.id,
        quarter: 'Q4 2026',
      },
    ])
    .returning();

  // Release v0.2 — planned, containing the comments/voting features. Its notes
  // live in a full release_notes document (no feature/idea owner — linked via
  // notes_doc_id), created from the Release notes template sections.
  const v02NotesMd = `# v0.2 — Team ready

## Highlights

ProductMap learns to argue with itself: threaded comments bring spec review into the tool, and 🚀/🧊 voting puts prioritization signal on every card. This is the release that makes ProductMap a team sport.

## What's new

- **Threaded comments on features and docs** — review feedback lives next to the work, with resolve/reopen so settled arguments stay auditable.
- **Up/down voting** — one Boost or Cool per person per feature, feeding an optional score sort on the board.

## Improvements

- Board cards surface open-thread counts so unresolved review work is visible at a glance.
- Resolved threads collapse out of the way but stay one click from the record.

## Fixes

- Doubled line breaks on paste from Google Docs.
- Cmd+K now opens the link dialog when text is selected, instead of the command palette.

## Thanks

Our design partners who pasted screenshots into chat for three months so we didn't have to imagine the problem.
`;
  const [v02NotesDoc] = await db
    .insert(documents)
    .values({
      featureId: null,
      ideaId: null,
      type: 'release_notes' as const,
      title: 'v0.2 — Team ready — Release notes',
      status: 'draft' as const,
      contentJson: markdownToTiptap(v02NotesMd),
      contentMd: v02NotesMd,
      createdBy: priya.id,
      updatedBy: priya.id,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(0.8),
    })
    .returning();
  const [v02] = await db
    .insert(releases)
    .values({
      name: 'v0.2 — Team ready',
      targetDate: nextMonth(28),
      status: 'planned',
      notesDocId: v02NotesDoc.id,
    })
    .returning();

  // Sizes on all 8 features (+ objectives, release, risk notes where they tell
  // a story). Capacity heuristic is s=1, m=3, l=6 weeks vs 4 teammates ×
  // weeks-in-month (≈17 wk): next month carries gantt + ai + comments, all L
  // → 18 wk, so the roadmap capacity strip shows ≥1 overcommitted month (AC5).
  const sizeFeature = async (
    f: typeof editor,
    size: 's' | 'm' | 'l',
    extra: { objectiveId?: string; releaseId?: string; riskMd?: string } = {},
  ) => {
    await db.update(features).set({ size, ...extra }).where(eq(features.id, f.id));
  };
  await sizeFeature(editor, 'l', { objectiveId: objRecord.id });
  await sizeFeature(board, 'm', { objectiveId: objRecord.id });
  await sizeFeature(gantt, 'l', {
    objectiveId: objRecord.id,
    riskMd: 'SVG hit targets get cramped on dense roadmaps; touch-device drag semantics deferred entirely.',
  });
  await sizeFeature(ai, 'l', { objectiveId: objSecurity.id });
  await sizeFeature(commentsFeature, 'l', { releaseId: v02.id });
  await sizeFeature(voting, 's', { releaseId: v02.id });
  await sizeFeature(realtime, 'l', {
    riskMd: 'Yjs makes the server-derived markdown guarantee eventually-consistent — the editor’s whole moat. Parked pending a >20-seat partner ask.',
  });
  await sizeFeature(ecs, 'm', { objectiveId: objSecurity.id });

  // Idea inbox: 5 inbox ideas, 2 with votes.
  const ideaRows = await db
    .insert(ideas)
    .values([
      {
        title: 'Slack notifications for resolved threads',
        bodyMd: 'When a review thread resolves, ping the doc author in Slack. Three partners asked in the same week — review latency is their top complaint.',
        source: 'support',
        createdBy: priya.id,
        createdAt: daysAgo(9),
        updatedAt: daysAgo(9),
      },
      {
        title: 'CSV export of the roadmap',
        bodyMd: 'Procurement at Northwind wants a quarterly spreadsheet snapshot. Ugly but it unblocks a contract.',
        source: 'sales call',
        createdBy: marcus.id,
        createdAt: daysAgo(7),
        updatedAt: daysAgo(7),
      },
      {
        title: 'Doc version history',
        bodyMd: 'A "what changed since I last reviewed" diff view. Reviewers currently re-read whole specs.',
        source: 'dogfooding',
        createdBy: elena.id,
        createdAt: daysAgo(5),
        updatedAt: daysAgo(5),
      },
      {
        title: 'Keyboard-first board triage',
        bodyMd: 'j/k to move between cards, h/l to change horizon. Weekly planning is mouse-bound today.',
        source: '',
        createdBy: corban.id,
        createdAt: daysAgo(3),
        updatedAt: daysAgo(3),
      },
      {
        title: 'SSO via OIDC',
        bodyMd: 'Two prospects gate the pilot on Okta login. Self-hosted + local users only gets us through security review, not rollout.',
        source: 'sales call',
        createdBy: marcus.id,
        createdAt: daysAgo(1.5),
        updatedAt: daysAgo(1.5),
      },
    ])
    .returning();
  const slackIdea = ideaRows[0];
  const ssoIdea = ideaRows[4];
  await db.insert(ideaVotes).values([
    { userId: priya.id, ideaId: slackIdea.id, value: 1 },
    { userId: elena.id, ideaId: slackIdea.id, value: 1 },
    { userId: marcus.id, ideaId: ssoIdea.id, value: 1 },
    { userId: corban.id, ideaId: ssoIdea.id, value: -1 },
  ]);

  // The SSO idea has been pitched properly — an idea_pitch doc owned by the
  // idea (feature_id stays NULL until promotion).
  const ssoPitchMd = `# SSO via OIDC

## Problem

Two prospects gate their pilot on Okta login. Self-hosted plus local users gets us through security review, but rollout stalls the moment IT asks "how do 40 people log in?" — manual accounts are a non-answer at that size.

## Who's asking (evidence)

- Source: Northwind pilot call (May 28) — "no Okta, no rollout" from their IT lead, verbatim.
- Source: Meridian security questionnaire — SSO is a hard requirement on the vendor checklist, not a nice-to-have.

## Proposed direction

Generic OIDC, not Okta-specific: a single redirect flow with discovery, mapping the email claim to a workspace user. Okta, Entra and Google all speak it, so one integration covers every prospect we have. Local users stay for self-hosters who want zero external dependencies.

## Why now

Both asks are attached to contracts in flight this quarter. Six months ago we had no prospects this size; six months from now they will have picked the tool that logged them in.

## Open questions

- [ ] Just-in-time user provisioning on first login, or admin pre-creates? (Marcus)
- [ ] Does session handling change for the share-link surface? (Elena)

## Effort gut-check

- Size: M
- Why: one well-trodden protocol, but auth touches every request path — testing is the cost, not the code.
`;
  await db.insert(documents).values({
    featureId: null,
    ideaId: ssoIdea.id,
    type: 'idea_pitch' as const,
    title: 'SSO via OIDC — Idea pitch',
    status: 'draft' as const,
    contentJson: markdownToTiptap(ssoPitchMd),
    contentMd: ssoPitchMd,
    createdBy: marcus.id,
    updatedBy: marcus.id,
    createdAt: daysAgo(1.4),
    updatedAt: daysAgo(1.1),
  });

  // Saved roadmap scenario: "Q4 stretch" — a draft snapshot of the current
  // schedule with the Gantt bar pushed +1 month, so compare mode shows one
  // ghost-vs-scenario offset out of the box.
  const inTwoMonths = (day: number) => iso(new Date(Date.UTC(y, m + 2, day)));
  const [q4Stretch] = await db
    .insert(plans)
    .values({
      name: 'Q4 stretch',
      status: 'draft',
      createdBy: corban.id,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    })
    .returning();
  await db.insert(planEntries).values(
    featureRows.map((f) => ({
      planId: q4Stretch.id,
      featureId: f.id,
      startDate: f.id === gantt.id ? inTwoMonths(1) : f.startDate,
      endDate: f.id === gantt.id ? inTwoMonths(18) : f.endDate,
      horizon: f.horizon,
    })),
  );

  // Evidence: 4 items on flagship features.
  await db.insert(evidence).values([
    {
      featureId: editor.id,
      kind: 'quote' as const,
      title: '“Feels like the tool I’m not allowed to use”',
      bodyMd: 'Beta partner PM, week one of the editor beta. Came up unprompted twice — it is the pitch, verbatim.',
      sourceUrl: '',
      weight: 1,
      createdBy: priya.id,
      createdAt: daysAgo(11),
    },
    {
      featureId: editor.id,
      kind: 'ticket' as const,
      title: 'Support tickets asking for markdown export',
      bodyMd: 'Every ticket is some flavor of “can I get my docs out as plain markdown?” — the round-trip guarantee is doing sales work.',
      sourceUrl: '',
      weight: 12,
      createdBy: marcus.id,
      createdAt: daysAgo(8),
    },
    {
      featureId: board.id,
      kind: 'metric' as const,
      title: 'Board is 41% of all page views',
      bodyMd: 'Most-visited route in the workspace over the last month, ahead of docs at 27%. The board is the front door.',
      sourceUrl: '',
      weight: 1,
      createdBy: corban.id,
      createdAt: daysAgo(6),
    },
    {
      featureId: ai.id,
      kind: 'research' as const,
      title: 'Empty-doc abandonment study',
      bodyMd: '11 of 19 docs created in partners’ first week had zero content a day later. The blank page is the stall; drafts are the fix.',
      sourceUrl: '',
      weight: 1,
      createdBy: priya.id,
      createdAt: daysAgo(4),
    },
  ]);

  // Decisions: one linked to the resolved voting-anonymity thread, one manual.
  await db.insert(decisions).values([
    {
      featureId: voting.id,
      title: 'Votes are aggregate-only',
      decisionMd: 'The API returns counts and your own vote — never who voted which way. The schema stores voters only to enforce one vote per person.',
      alternativesMd: 'Attributed votes (rejected: nobody would ever 🧊 a teammate’s pet feature); fully anonymous storage (rejected: cannot enforce the one-vote constraint).',
      sourceCommentId: votingAnonRoot.id,
      decidedBy: priya.id,
      decidedAt: daysAgo(4.5),
      createdAt: daysAgo(4.5),
    },
    {
      featureId: editor.id,
      title: 'Tiptap JSON is the source of truth; markdown is derived',
      decisionMd: 'The server derives content_md from contentJson on every save via one shared extension list. The client never serializes markdown itself.',
      alternativesMd: 'Markdown as source of truth (lossy for tables and node attrs); both written by the client (two writers drift — Marcus measured 14 divergences in a week).',
      decidedBy: marcus.id,
      decidedAt: daysAgo(28),
      createdAt: daysAgo(28),
    },
  ]);

  // Dependencies: comments blocks realtime (review before multiplayer),
  // board blocks voting (score sort needs the board). ECS blocks nothing.
  await db.insert(featureDependencies).values([
    { blockerId: commentsFeature.id, blockedId: realtime.id },
    { blockerId: board.id, blockedId: voting.id },
  ]);

  console.log(
    `seeded: 1 product, ${featureRows.length} features, ${docRows.length + 2} documents (incl. idea pitch + release notes), 6 templates, 4 users, 8 comment threads, 18 votes, 3-month activity history, 5 ideas, 4 evidence, 2 decisions, 2 dependencies, 1 release, 2 objectives, 1 saved plan`,
  );
  console.log('[seed] Login: admin@productmap.local / devpassword123 (dev only)');
}

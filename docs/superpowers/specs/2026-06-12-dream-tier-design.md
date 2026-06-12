# Dream Tier — D1–D9 Consolidated Design

**Date:** 2026-06-12 · **Extends:** all prior specs. Soft Studio + Studio Ink + UX guidelines binding. All AI via existing Bedrock/AI-SDK pipeline with mock-model tests (no AWS creds in dev env). Existing 66 e2e + 370 unit tests stay green.

The nine features answer three questions: **why this** (D1 Idea Inbox, D2 Evidence, D9 Outcomes), **what did we decide** (D3 Decisions, D4 Dependencies & risk, D6 Capacity), **who have we told** (D7 Releases, D8 Broadcast). D5 Copilot threads through.

## Schema (ALL new tables in ONE migration — foundation agent owns)

```
ideas        id, title text NOT NULL, body_md text DEFAULT '', source text DEFAULT '',   -- "sales call", "support", freeform
             status ENUM idea_status('inbox','triaged','promoted','archived') DEFAULT 'inbox',
             promoted_feature_id uuid FK features NULL, created_by FK users, created_at, updated_at
idea_votes   user_id FK, idea_id FK, value smallint CHECK IN (1,-1), created_at, PK(user_id, idea_id)
evidence     id, feature_id FK NOT NULL, kind ENUM evidence_kind('quote','research','ticket','metric','other'),
             title text NOT NULL, body_md text DEFAULT '', source_url text DEFAULT '', weight int DEFAULT 1,  -- e.g. ticket count
             created_by FK users, created_at
decisions    id, feature_id FK NULL, title text NOT NULL, decision_md text NOT NULL,
             alternatives_md text DEFAULT '', source_comment_id uuid FK comments NULL,
             decided_by FK users, decided_at timestamptz DEFAULT now(), created_at
feature_dependencies  blocker_id FK features, blocked_id FK features, PK(blocker_id, blocked_id), CHECK (blocker_id <> blocked_id)
releases     id, name text NOT NULL, target_date date NULL, status ENUM release_status('planned','shipped') DEFAULT 'planned',
             notes_md text DEFAULT '', shipped_at timestamptz NULL, created_at
objectives   id, title text NOT NULL, metric text DEFAULT '', target text DEFAULT '', quarter text DEFAULT '', created_at
share_tokens id, token text UNIQUE NOT NULL, kind text DEFAULT 'roadmap', created_at, revoked_at NULL
features     + size ENUM feature_size('s','m','l') NULL, + risk_md text DEFAULT '', + objective_id FK objectives NULL, + release_id FK releases NULL
activity     new kinds: idea_promoted, decision_logged, dependency_added, dependency_removed, release_shipped, size_changed
```
Seed additions (foundation agent): 5 inbox ideas (2 with votes), 4 evidence items on flagship features, 2 decisions (one linked to an existing resolved comment thread), 2 dependencies (Realtime blocked-by Auth-ish: use "Comments & review" → "Realtime collaboration"; "ECS deployment" blocks nothing — pick sensible pairs), 1 release "v0.2 — Team ready" (planned, containing comments/voting features), 2 objectives, sizes on all 8 features.

## API contracts (route file per resource; app.ts mounts created by foundation as stubs)

```
ideas.ts      GET /api/ideas?status=  POST /api/ideas {title, bodyMd?, source?}  PATCH /api/ideas/:id {title?,bodyMd?,source?,status?}
              PUT /api/ideas/:id/vote {value:1|-1|0}   POST /api/ideas/:id/promote {horizon} → creates feature (copies body to description), sets promoted_feature_id+status, returns feature; optional {withAiBrief:true} also creates feature_brief doc via AI (503-safe: skip silently when disabled)
evidence.ts   GET /api/features/:id/evidence   POST /api/features/:id/evidence {kind,title,bodyMd?,sourceUrl?,weight?}   DELETE /api/evidence/:id
decisions.ts  GET /api/decisions?featureId=    POST /api/decisions {featureId?,title,decisionMd,alternativesMd?,sourceCommentId?}
              DELETE /api/decisions/:id
              POST /api/ai/suggest-decision {commentId}  → AI reads the thread, returns {suggested:boolean, title, decisionMd, alternativesMd} (JSON via generateObject, mock-tested)
deps.ts       GET /api/features/:id/dependencies → {blockers:Feature[], blocked:Feature[]}   PUT /api/features/:id/dependencies {blockerIds:string[]}  (replace-set; cycle rejection 400 via DFS)
releases.ts   CRUD /api/releases; POST /api/releases/:id/ship (sets shipped + release_shipped activity); GET /api/releases/:id/notes.md (auto-assembled: feature list + their final docs' summaries)
objectives.ts CRUD /api/objectives; features PATCH gains objectiveId/releaseId/size/riskMd
share.ts      POST /api/share/roadmap → {url:"/share/:token"}; DELETE /api/share/:token; GET /api/share/:token/data → read-only {product, features, releases} (NO auth header needed, no mutations)
copilot.ts    POST /api/ai/review-doc {documentId} → SSE markdown review (rubric: problem clarity, measurable metrics, testable requirements, non-goals, risks; cites doc lines)
              POST /api/ai/chat {question} → SSE; context = top-8 docs by Postgres full-text rank over content_md + feature summaries (plainto_tsquery; no embeddings)
              GET /api/copilot/nudges → derived: drafts untouched >14d, dateless now-features, oversized (l-size in now with no docs), unresolved threads >7d
```
zod schemas for all bodies in packages/shared (foundation agent). Capacity: pure client math — no endpoint.

## Web surfaces

- **Inbox** `/inbox` (nav item between Overview and Board, lightbulb icon): two-column — idea list (vote pills like board, status filter chips) + detail pane (body, source, promote button → horizon picker + "Draft AI brief" checkbox). Promoted ideas show link to feature. Empty state invites first idea. ⌘K: "New idea…".
- **Feature page additions** (ONE agent owns all FeaturePage edits): Evidence section (kind-icon cards, weight badge, add popover) under Description; Dependencies in right rail (blockers list with status dots, "blocked by N" amber badge when any blocker unshipped, edit popover w/ cycle error toast); Size select (S/M/L pill) + Risk notes (collapsible md textarea) in rail; Decisions section between Comments and Activity (decision cards: title, decided-by avatar, date, expandable alternatives). Board FeatureCard gains: blocked badge (amber ⛓ when blockers unshipped) + size chip.
- **Decision extraction**: in CommentsSection, resolved root comments get a sparkle "Log decision" affordance → calls suggest-decision → prefilled dialog → save. (Same agent as feature page? No — comments agent lane; see workflow ownership.)
- **Gantt upgrades**: dependency arrows (bezier from blocker bar end → blocked bar start, muted action color, arrowhead); release milestones (diamond at target_date with name label, sage when shipped); capacity strip toggle: weeks×size heuristic (s=1,m=3,l=6 weeks per feature, summed over bars overlapping each month) vs capacity = 4×weeks-in-month (4 teammates), overcommitted months get warm wash + warning chip.
- **Releases** `/releases`: list (status, target date, feature count, ship button w/ confetti) + release detail: features table, notes editor (prefill from notes.md endpoint), "Copy markdown". Changelog section on share page for shipped releases.
- **Outcomes** `/outcomes`: objectives as cards (metric/target/quarter) with their features as mini-rows grouped by horizon; unassigned features tray; assign via feature rail select (objective dropdown).
- **Share** `/share/:token`: chrome-less read-only roadmap (gantt + now-next-later summary + shipped changelog), ProductMap badge footer, no auth, dark/light per system. Workspace settings tab gains "Sharing" block: create/copy/revoke link.
- **Copilot**: right-side panel (sparkle button in AppShell, ⌘J): tabs Chat (workspace-grounded Q&A, streaming, cites doc titles as links) and Nudges (list from endpoint, click-through). Doc editor ⋯ menu gains "AI review" → streams review into a side sheet with rubric sections.

## Acceptance criteria

1. Idea lifecycle: create in inbox → vote → promote to Later with AI brief (mocked) → feature exists with description + brief doc + idea marked promoted, activity logged.
2. Evidence: add a quote + a ticket-count (weight 12) to a feature → cards render with kind icons; delete works.
3. Decisions: "Log decision" on a seeded resolved thread → AI-suggested (mocked) prefill → saved card on feature page; manual decision creation works; suggest-decision prompt contains the thread text (integration test).
4. Dependencies: set blocker via rail → board card shows blocked badge, Gantt draws arrow; cycle attempt → 400 + toast; shipping blocker clears badge.
5. Capacity: toggle on roadmap shows per-month load vs capacity; an overcommitted month renders warning state (seed must produce ≥1).
6. Releases: ship "v0.2" → confetti, status sage, milestone diamond turns sage on Gantt, release appears in share-page changelog; notes.md assembles feature names.
7. Outcomes: assign feature to objective via rail; /outcomes groups correctly; unassigned tray accurate.
8. Share: create link in settings → open /share/:token in fresh context (no localStorage) → roadmap renders read-only, zero mutating affordances; revoke → 404.
9. Copilot: chat answers a question about seeded content with doc citations (mocked model, but retrieval is real — integration test asserts top-ranked docs in prompt); AI review streams rubric sections into sheet (mocked); nudges list shows seeded stale-draft + dateless items; all AI affordances hidden when disabled.
10. tsc clean; pnpm test green; pnpm e2e green (existing 66 + new specs per surface).

## Out of scope
Embeddings/vector search, email sending (broadcast = share link + copy-markdown), Slack/webhook intake, multi-product rollup, PR/git integration.

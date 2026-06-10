# Comments & Voting — Design Addendum

**Date:** 2026-06-10 · **Extends:** demo spec + feature-hub addendum. Soft Studio language and existing UX guidelines binding.

## Comments

**Model** — `comments` table:
```
id uuid pk, author_id uuid FK users NOT NULL,
feature_id uuid FK features NULL, document_id uuid FK documents NULL,
  -- exactly one of feature_id/document_id set (CHECK constraint)
parent_id uuid FK comments NULL,   -- replies: one level deep only (parent must have parent_id NULL; enforce in API)
body text NOT NULL (1..4000),
resolved_at timestamptz NULL, resolved_by uuid FK users NULL,
created_at, updated_at
```
Thread = root comment + its replies. Resolve acts on the root (replies inherit). Deleting a root cascades replies (`onDelete: cascade` on parent_id).

**API**
```
GET    /api/comments?featureId= | ?documentId=   → CommentThread[] (root + nested replies[], joined author name/color; unresolved first, then resolved; newest roots first within each group)
POST   /api/comments      {featureId?|documentId?, parentId?, body}  → Comment (201; rejects reply-to-reply 400; author = x-user-id)
PATCH  /api/comments/:id  {body?}                → Comment (author only edits own body; 403 otherwise)
PATCH  /api/comments/:id/resolve   {resolved: boolean} → root only (400 on reply); sets resolved_at/by
DELETE /api/comments/:id           → 204 (author only, 403 otherwise)
```
Activity recording: `comment_added`, `comment_resolved` (feature-level activity; doc comments attribute to the doc's feature). Commenter auto-added as collaborator.

**Attention panel** — new item kinds: `open_comments` per feature: `{ kind: 'open_comments'; featureId; title; count }` (count of unresolved roots across the feature and its docs). Sorts above existing kinds. Click → feature page comments section.

**UI**
- `CommentsSection` component (shared by both surfaces): list of threads; each thread = author avatar + name + relative time, body, Reply / Resolve / ⋯(edit/delete own) actions; reply composer indents one level; resolved threads collapse under "N resolved" toggle with sage check styling.
- Composer: rounded-2xl card, textarea autosizing, Cmd+Enter submits, primary pill "Comment".
- Feature page: "Comments" section between Docs grid and Activity, count pill in header.
- Editor: toolbar gains comment icon pill with unresolved-count badge → right Sheet (480px) with the same CommentsSection for the doc. Editor stays usable underneath (non-modal sheet).
- Empty state: "No comments yet — start the discussion."

## Voting — 🚀 Boost / 🧊 Cool

**Model** — `votes` table:
```
user_id uuid FK users, feature_id uuid FK features,
value smallint NOT NULL CHECK (value IN (1,-1)),
created_at; PRIMARY KEY (user_id, feature_id)
```
Score = sum(value). One vote per user per feature; clicking same control again removes the vote; clicking the other flips it.

**API**
```
PUT    /api/features/:id/vote   {value: 1 | -1 | 0}   → { score, boosts, cools, myVote }   (0 = clear)
```
`GET /api/features` and `/api/overview` feature payloads gain `{ score, boosts, cools, myVote }`.

**UI**
- `VoteWidget`: two pill buttons 🚀 and 🧊 with counts; my active vote = filled tint (🚀 active: #dcebff/#2b557e; 🧊 active: #d9f2f0/#0e7490); press animation: quick 1.15x scale pop, 150ms. Net score chip between them (+3 / −1 / 0 muted).
- Board cards: compact VoteWidget bottom row (stopPropagation so card click still opens peek).
- Feature page: full-size VoteWidget next to status pills.
- Board header: sort toggle pill "Order ▾: Manual | Score" (score sorts desc within each column; persisted in localStorage; manual = existing sortOrder).

## Acceptance criteria

1. Comment on a doc from the editor sheet and on a feature from its page; replies nest one level; reply-to-reply rejected (no UI affordance; API 400).
2. Resolve collapses the thread into the resolved group; reopen restores; both write activity entries visible in the feature feed.
3. Attention panel shows "N open comments" per feature with unresolved threads (doc + feature combined); resolves drop the count live; zero unresolved → item gone.
4. 🚀/🧊 vote, un-vote, and flip all work and persist; counts and my-vote tint correct after reload; one vote per user enforced.
5. Board score sort reorders columns by net score and toggles back to manual; choice survives reload.
6. Comment author shows name + avatar color; only authors see edit/delete on their own comments (different localStorage user hides them).
7. Existing suites + new tests green: `pnpm -r exec tsc --noEmit`, `pnpm test`, `pnpm e2e`.

## Out of scope (stays in BACKLOG.md)

Inline anchored comments (v2.5), @mentions, comment notifications, emoji reactions on comments.

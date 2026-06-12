# Dream Tier 2 — Review Feedback Build-out

**Date:** 2026-06-12 · **Extends:** dream-tier spec. Soft Studio/Studio Ink + UX guidelines binding. Existing 538 unit + 77 e2e green throughout.

User feedback driving this: (1) ideas not editable, no attribution; (2) idea description too thin to sell an idea — needs own doc+template; (3) objectives lack creation UI and real properties; (4) release notes should be full docs in the editor; (5) can't manage release membership from release detail; (6) roadmap scenario planning — draft plans, compare, promote one to current; (7) release status change/undo.

## Schema changes (ONE migration, foundation agent)

```
doc_type enum        + 'idea_pitch' + 'release_notes'   (ALTER TYPE ... ADD VALUE)
documents            + idea_id uuid FK ideas NULL       -- a doc belongs to a feature OR an idea (feature_id becomes NULLABLE; CHECK exactly-one-of(feature_id, idea_id) EXCEPT release_notes docs which keep feature_id NULL and idea_id NULL — see releases)
releases             + notes_doc_id uuid FK documents NULL; DROP notes_md (migrate existing content into a created doc)
objectives           + description_md text DEFAULT '', + metric stays, + target stays, + current text DEFAULT '',
                     + status ENUM objective_status('on_track','at_risk','achieved','dropped') DEFAULT 'on_track',
                     + owner_id uuid FK users NULL, + quarter stays
plans                id, name text NOT NULL, status ENUM plan_status('draft','applied','archived') DEFAULT 'draft',
                     created_by FK users, applied_at timestamptz NULL, created_at, updated_at
plan_entries         plan_id FK plans CASCADE, feature_id FK features CASCADE,
                     start_date date NULL, end_date date NULL, horizon horizon NOT NULL, PK(plan_id, feature_id)
activity             new kinds: idea_edited, plan_applied, release_status_changed
```

Shared updates: `DOC_TYPES` + 'idea_pitch' + 'release_notes'; `DOC_TYPE_COLORS` idea_pitch = warm amber chip `bg-[#fdf0e3] text-[#9a6428]` edge `#b45309`, release_notes = slate-blue chip `bg-[#e2e8f0] text-[#475569]` edge `#475569`; `DOC_TYPE_LABELS` "Idea pitch" / "Release notes". New-doc dialog for FEATURES excludes both new types (they're created via their owning surfaces). Docs library includes them (feature column shows "—" or idea/release name+link).

Templates seed (foundation): "Idea pitch" template (sections: Problem / Who's asking (evidence) / Proposed direction / Why now / Open questions / Effort gut-check) and "Release notes" template (sections: Highlights / What's new / Improvements / Fixes / Thanks) — both is_default for their types. Settings template manager shows the new groups automatically (grouping iterates DOC_TYPES).

## API

```
ideas.ts     PATCH /api/ideas/:id already exists — ensure title/bodyMd/source/status all editable + idea_edited activity.
             GET /api/ideas now joins creator {id,name,color} + pitchDoc meta (id,title,status) if any.
             POST /api/ideas/:id/pitch → creates idea_pitch doc from default template ({{title}} = idea title), idea_id set, returns DocumentFull (409 if exists).
             PROMOTE updated: transfers pitch doc to the new feature (sets feature_id, keeps idea_id for provenance).
objectives.ts POST/PATCH accept all new properties; GET joins owner {name,color} + feature counts.
releases.ts  PATCH /api/releases/:id {name?,targetDate?,status?} — status transitions BOTH ways; shipped→planned clears shipped_at; release_status_changed activity (from,to).
             POST /api/releases/:id/notes-doc → creates release_notes doc from template if none (notes_doc_id), returns DocumentFull.
             POST /api/releases/:id/generate-notes → fills the notes doc body from member features + their final docs (assembled markdown → tiptap, overwrites doc, returns it). DELETE /releases/:id/ship endpoint replaced by PATCH status (keep POST /ship as alias calling same logic for back-compat with existing e2e or update e2e).
             PUT /api/releases/:id/features {featureIds: string[]} — replace-set membership (sets/clears features.release_id).
plans.ts     GET /api/plans  POST /api/plans {name, copyFrom:'current'|planId} (snapshot features' dates+horizon into entries)
             PATCH /api/plans/:id {name?}  DELETE /api/plans/:id
             PUT /api/plans/:id/entries/:featureId {startDate?,endDate?,horizon?} (scenario editing — touches plan_entries only)
             POST /api/plans/:id/apply → transaction: write entries to features (dates+horizon), record dates_changed/horizon_changed activity per changed feature + plan_applied, mark plan applied (other applied plans → archived). Returns diff summary {changed:[{featureId,title,fields}]}.
```

## Web

**Inbox (1+2)** — idea rows show creator avatar + "by Priya · 3d ago". Detail pane: editable title (blur save), source input, status; body becomes "Pitch" block: if no pitch doc → "Write the pitch" button (creates + navigates to /docs/:id which now renders idea-owned docs with back-link "← Idea: <title>"); if pitch exists → doc card (type chip, status, word count) linking to editor + the bodyMd field remains as "Quick summary" textarea. Promote moves pitch doc with the idea (feature page shows it under Docs).

**Outcomes (3)** — "New objective" primary button → dialog: title, description (textarea md), metric, target, current, quarter (select: Q3 2026…), owner (user select), status (select). Objective cards show owner avatar, status pill (on_track sage / at_risk warm / achieved action / dropped slate), metric → target → current progress line; ⋯ edit (same dialog) + drop. Feature mini-rows unchanged.

**Release detail (4,5,7)** — Features section: current member rows (remove ✕) + "Add features" popover (checklist of unassigned features, saves via PUT replace-set). Notes section: if no doc → "Create notes doc" → editor; card links to editor; "Generate draft from features" button (confirm overwrite) → calls generate-notes → opens editor. Status: select pill planned/shipped replacing ship-only button — shipping still fires confetti (only on planned→shipped transition); unshipping reverts milestone diamond + changelog. Release list shows status select inline too.

**Roadmap scenarios (6)** — plan switcher pill row left of Capacity/History: "Current" + saved plans + "+ New plan" (name dialog, snapshots current). Selecting a plan enters scenario mode: banner "Editing scenario '<name>' — changes don't touch the real roadmap", bars render from plan_entries and drag/resize/tray-drop write plan entries; ghost bars of CURRENT schedule render beneath at 30% opacity (toggle "Compare" pill); horizon recolor allowed via existing peek? No — scenario edits are dates+horizon via bar drag and a small horizon select on row hover (keep scoped). "Apply as current plan" primary button → confirm dialog listing the diff (from API response shape, fetch preview by diffing client-side) → apply → toast + exit to Current. History (Time Machine) disabled inside scenario mode. Plans manageable (rename/delete) via switcher ⋯.

## Acceptance criteria

1. Idea: edit title/source inline, creator avatar + relative time visible in list and detail; edits persist + idea_edited activity.
2. Pitch: "Write the pitch" creates doc from Idea pitch template (sections present), editor back-link reads "← Idea: …", docs library lists it with Idea pitch chip; promote → doc appears on the new feature's page.
3. Objective: create via dialog with all properties; card shows owner, status pill, metric/target/current; edit + status change persist.
4. Release notes: create doc from template, edit in full editor, "Generate draft from features" fills it from member features (mock-free — pure assembly), docs library shows Release notes chip.
5. Release membership: add 2 features via popover, remove 1 via row ✕ — board/gantt/share reflect release_id changes.
6. Release status: planned→shipped via select fires confetti + sage milestone; shipped→planned reverts everywhere incl. share changelog.
7. Scenarios: create plan "Q4 stretch", drag a bar +1 month and move a feature Later→Now inside it — REAL roadmap unchanged (reload /roadmap Current proves it); Compare shows ghost bars; Apply → confirm diff lists both changes → real features updated + activity entries + plan marked applied; Time Machine still works after.
8. Settings template manager shows Idea pitch + Release notes groups; their templates editable like any other.
9. tsc clean; pnpm test green; pnpm e2e green (existing 77 updated only where intentional — e.g. ship-button → status select — plus new specs).

## Out of scope
Multi-plan side-by-side view, plan sharing, objective key-results breakdown, idea dedup/merge.

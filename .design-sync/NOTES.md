# design-sync notes for @productmap/ui

## Build gotchas

- **`packages/ui` has no build step** (ships raw TSX like `packages/shared`/`sdk`). The converter runs with `--entry ./packages/ui/src/index.ts` in synth-entry mode — no `dist/` to build first.
- **`packages/ui` has no compiled stylesheet of its own** — its Tailwind classes are only meaningful once run through `apps/web`'s Tailwind config + token CSS. Before every sync/re-sync, regenerate `packages/ui/dist/ui.css` (gitignored, not part of the package's normal build):

  ```sh
  cd apps/web && pnpm exec tailwindcss -c tailwind.config.ts -i src/index.css -o ../../packages/ui/dist/ui.css --minify
  ```

- **Brand fonts (Bricolage Grotesque, Schibsted Grotesk) load via a `<link>` tag in `apps/web/index.html`** (Google Fonts), not a shipped `@font-face`. The scrape can't see a `<link>` tag, so after compiling `ui.css` above, prepend a matching `@import url(...)` line (same URL as the `<link href>` in `apps/web/index.html`) to the top of `packages/ui/dist/ui.css` — otherwise `package-validate.mjs` flags `[FONT_MISSING]`. Do this BEFORE running `package-build.mjs`.

## Scope

- 14 source files in `packages/ui/src/components/ui/` export 72 named symbols total (compound sub-parts like `DialogHeader`, `CardFooter`, `SelectItem`). Only the 14 primary/top-level exports (Badge, Button, Card, Command, Dialog, DropdownMenu, Input, Label, Popover, RadioGroup, Select, Sheet, Skeleton, Textarea) have authored rich previews in `.design-sync/previews/`; the rest ship fully functional but on the floor card. Authoring more is a standing offer for a future re-sync.
- `sonner.tsx` (Toaster) was **intentionally not moved** into `packages/ui` during the extraction PR — it depends on `apps/web/src/lib/theme.ts` (app-local dark/light state). It is not part of this design-sync's scope.
- Overlay/popover-style components have `cfg.overrides` in `config.json` (`cardMode: "single"` + a fixed `viewport`) so their open state renders inside the card instead of escaping: Dialog, Sheet, DropdownMenu, Popover, Select, Command.

## Re-sync risks

- The two manual build steps above (Tailwind compile + font `@import` prepend) are NOT part of `packages/ui`'s own build — if `apps/web`'s token CSS (`src/index.css`) or `tailwind.config.ts` changes, re-run both before re-syncing or the bundle will render stale/unstyled.
- If the Google Fonts `<link>` URL in `apps/web/index.html` ever changes (new font, new weight range), update the `@import` prepend to match.
- `dist/ui.css` is gitignored (covered by the repo's blanket `dist/` rule) — it does not persist between clones/syncs. A fresh clone must regenerate it before syncing.

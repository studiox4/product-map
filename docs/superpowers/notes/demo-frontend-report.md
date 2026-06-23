# Demo frontend wiring — report

Branch: `demo-mode`. Wires a `/demo` entry that boots the in-page demo runtime
and drops the visitor into the real app as the seeded demo user, with a "nothing
saves" banner, hidden export affordances, and the heavy PGlite/Hono graph
code-split to load ONLY at `/demo`.

## Files

New:
- `apps/web/src/demo/demoState.ts` — dependency-free leaf holding the demo flag.
  Exports `demoReady()`, `getDemoProjectId()`, `setDemoEnabled()`. **Critical for
  the code-split:** the synchronous `demoReady()` render-path gate lives here so
  AppShell / DemoBanner / affordance gates never static-import `enableDemo.ts`
  (which would drag the PGlite/Hono graph into the main chunk).
- `apps/web/src/demo/DemoEntry.tsx` — `/demo` route. Branded "Spinning up your
  demo…" loader; effect dynamically `import('./enableDemo')`, `await enableDemo()`,
  `queryClient.setQueryData(['me'], getDemoUser())`, then `navigate('/app', {replace})`.
  StrictMode-guarded with a ref; error state offers "Try again". The dynamic
  import is what keeps the heavy graph in a lazy chunk.
- `apps/web/src/demo/DemoBanner.tsx` — slim indigo (`bg-action`) strip, "Demo
  mode — nothing you do is saved." + "Sign up to keep your work" → `/register`.
  Renders only when `demoReady()`. Imports only `demoState`.
- `apps/web/src/demo/argon2-stub.ts` — browser stub for `@node-rs/argon2`.
- `apps/web/src/demo/node-only-stub.ts` — browser stub for `@ai-sdk/amazon-bedrock`,
  `@aws-sdk/credential-providers`, `archiver`, `nodemailer`.

Modified:
- `apps/web/src/demo/enableDemo.ts` — added `getDemoUser()` (returns the app
  `User` shape: `{ id: DEMO_USER_ID, name: 'Corban', color: '#2b557e', role: 'admin' }`
  — note the `User` type has `color`, not `email`; matched the type, mirrored the
  seed colour). Moved the flag/projectId into `demoState.ts`; re-exports
  `demoReady`/`getDemoProjectId` for the existing test importer.
- `apps/web/src/App.tsx` — `const DemoEntry = lazy(() => import('@/demo/DemoEntry'))`
  + public `<Route path="/demo">`.
- `apps/web/src/components/AppShell.tsx` — mounts `<DemoBanner />` at the very top
  of the shell `<div>`, above `<header>`. **This is where the banner mounts**, so
  it shows across all `/app` pages.
- `apps/web/src/components/marketing/Hero.tsx` — added primary "Try the live demo"
  CTA (plain `<a href="/demo">`, no import — keeps the landing chunk clean).
- `apps/web/vite.config.ts` — web-build-only `resolve.alias` entries pointing the
  node-only packages at the stubs.
- `apps/web/src/routes/Doc.tsx`, `apps/web/src/components/editor/EditorToolbar.tsx`
  — `exportHref` made optional; passed `undefined` in demo (markdown export uses a
  real `<a href download>` against the live origin, which the in-page backend can't serve).
- `apps/web/src/components/settings/WorkspaceTab.tsx` — hides the Export card (zip
  download) in demo.
- `apps/web/src/components/command/CommandPalette.tsx` — hides the "Export markdown"
  command in demo.
- `apps/api/src/routes/uploads.ts` — `/* @vite-ignore */` on its lazy `node:*`
  imports (matches the existing `conninfo` pattern) so they aren't bundled.

## What I hid in demo (and what was already gated)

- **Export affordances** (the real gap): zip export in WorkspaceTab, `Export .md`
  in EditorToolbar, and the "Export markdown" command-palette item — all are raw
  `<a href download>` / synthetic-anchor downloads that bypass `demoFetch` and
  would 404 against the live origin. Gated on `demoReady()`.
- **AI / copilot affordances were already auto-hidden**: the copilot button,
  Doc `onAiReview`, release-notes generate, AI digest etc. all gate on
  `useAiStatus().data?.enabled`, which is `false` in demo (no AI key). No
  redundant `demoReady()` gates added there.
- **No logout/login UI exists** inside the authed shell (cookie auth, no logout
  button), so that bullet was moot — nothing to replace. The banner's "Sign up"
  CTA covers the sign-up path.

## Code-split proof (chunk names)

`pnpm --filter @productmap/web build` → all three sub-steps pass (client build,
`vite build --ssr src/entry-marketing.tsx`, `node scripts/prerender.mjs` →
`marketing.html` written).

The heavy demo graph (PGlite WASM + the real Hono `app`) is isolated in a single
lazy chunk:

```
dist/assets/enableDemo-CqRPCUpy.js   1,242.44 kB │ gzip: 331.34 kB
```

`grep -rl "pglite\|PGlite" dist/assets/*.js` → matches **only**
`enableDemo-CqRPCUpy.js`.

Per-chunk heavy-ref counts (`PGlite|@electric-sql|argon2|archiver|amazon-bedrock`):
- `index-Bl7LldHi.js` (vendor): **0**
- `index-DiIwE8nK.js` (main app entry): **0**
- `Marketing-CA6LIroF.js` (landing): **0**

So PGlite/argon2/archiver/AWS are absent from the main and landing chunks and
present only in the lazy `enableDemo` chunk, which is reached solely via the
dynamic `import('./enableDemo')` inside `DemoEntry` (itself a `lazy()` route).

## Build break encountered + fix (for the record)

The break was NOT the SSR/prerender step the task hinted at — `entry-marketing.tsx`
only imports `<Marketing/>` and never touches the demo graph, so prerender is
fine. The break was the **client demo chunk** bundling node-only leaves of the
real `app` graph: `@node-rs/argon2` (browser.js → missing `-wasm32-wasi` WASM
dep), then `@aws-sdk/credential-providers` / `@ai-sdk/amazon-bedrock` (ai.ts),
`archiver` (documents.ts export), `nodemailer` (mailer.ts), and `node:*` builtins
in uploads.ts. All are reached only via `await import()` in handlers the demo
never executes (AI disabled, exports hidden, no mail/login). Fixed with
package-boundary stub aliases (cuts the whole node-only subtree, incl. its `node:`
imports) + `@vite-ignore` on uploads' node builtins.

**Maintenance note:** any future node-only dependency added to the `apps/api`
`app` graph will break the demo build until it's stubbed/aliased the same way.

## Verify summary

- `tsc --noEmit` (run as `tsc -p tsconfig.json` in the build): clean.
- `pnpm --filter @productmap/web test`: **415 passed (65 files)**, incl. the
  demo-runtime test and a new Hero CTA assertion.
- `pnpm --filter @productmap/web build`: passes (client + `--ssr` + prerender).

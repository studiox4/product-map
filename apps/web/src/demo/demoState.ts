// Lightweight, dependency-free demo state leaf.
//
// CRITICAL for code-splitting: this module imports NOTHING heavy. The real
// demo runtime (`enableDemo.ts`) statically imports the Hono `app`, PGlite
// (`createDemoDb`), the seed data, and the migrations — that whole graph is
// only ever reached via a DYNAMIC `import('./enableDemo')` inside DemoEntry.
//
// The app shell, the demo banner, and every "hide this in demo" affordance
// gate need a SYNCHRONOUS `demoReady()` they can call during render. If any of
// them imported it from `enableDemo.ts`, Rollup would pull the entire PGlite /
// Hono graph into the main chunk. So the flag lives here instead, and
// `enableDemo()` flips it via `setDemoEnabled()`.

let _enabled = false;
let _projectId: string | null = null;

/** Reactively-checkable flag: is the demo runtime live? */
export function demoReady(): boolean {
  return _enabled;
}

/** The seeded demo project id (available after enableDemo resolves). */
export function getDemoProjectId(): string {
  if (_projectId == null) {
    throw new Error('Demo not enabled — call enableDemo() first');
  }
  return _projectId;
}

/** Internal: flipped by enableDemo() once the runtime is up. */
export function setDemoEnabled(projectId: string): void {
  _projectId = projectId;
  _enabled = true;
}

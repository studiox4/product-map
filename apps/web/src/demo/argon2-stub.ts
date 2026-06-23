// Browser stub for @node-rs/argon2 (a native node addon).
//
// The demo runs the real Hono `app` + seed in-page. Those graphs *reference*
// argon2's `hash`/`verify` via dynamic `import('@node-rs/argon2')`, but the demo
// NEVER invokes them: `seedDemo` is handed a stub hasher and the demo mints its
// auth cookie directly instead of logging in. Aliasing the whole package to this
// file (see vite.config.ts) keeps argon2's `browser.js` — and its missing
// `@node-rs/argon2-wasm32-wasi` WASM dep — out of the demo chunk entirely.
//
// No-ops (not throws) so the build is clean and any stray call degrades safely.

export async function hash(_plain: string): Promise<string> {
  return 'demo-no-argon2';
}

export async function verify(_hash: string, _plain: string): Promise<boolean> {
  return false;
}

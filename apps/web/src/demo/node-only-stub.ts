// Browser stubs for node-only npm packages that the real Hono `app` graph
// reaches via `await import(...)` inside route handlers (AI/Bedrock, the zip
// export, transactional email). The demo imports the whole `app` to answer
// requests in-page, but NEVER reaches these code paths: AI is reported disabled,
// the export affordances are hidden in demo, and the demo never sends mail.
//
// Aliasing the packages to this stub (see vite.config.ts) keeps their node-only
// subtrees — and the `node:*` builtins they pull — out of the demo chunk, the
// same trick used for @node-rs/argon2. The exports throw so that, if a hidden
// path is ever wired back up, it fails loud rather than silently misbehaving.
// They sit inside `await import()` in handlers, so a throw can never break the
// build or the demo boot.

function unavailable(name: string): never {
  throw new Error(`${name} is not available in the in-browser demo`);
}

// @ai-sdk/amazon-bedrock
export function createAmazonBedrock(): never {
  return unavailable('createAmazonBedrock');
}

// @aws-sdk/credential-providers
export function fromNodeProviderChain(): never {
  return unavailable('fromNodeProviderChain');
}

// archiver (default export)
export default function archiver(): never {
  return unavailable('archiver');
}

// nodemailer (used as `nodemailer.createTransport(...)`)
export function createTransport(): never {
  return unavailable('nodemailer.createTransport');
}

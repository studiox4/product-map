# F4a — License-key verifier in the public core (`@productmap/sdk`)

**Status:** Approved (brainstorm) — 2026-06-30
**Part of:** Open-core foundation (spec `2026-06-24-open-core-edition-architecture-design.md`), F4. This is the **public-core** half; the private edition (signing CLI, `LicenseKeyProvider`, gated plugin) is F4b in `studiox4/productmap-cloud`.

## Goal

Add stateless **license-signature verification** to `@productmap/sdk` so the paid Team edition can turn a signed license token into an `Entitlements` snapshot. The public core ships **verification only** — never the private signing key, never a key generator. With no license, the core uses `CommunityProvider` (unchanged).

## Scope decisions (locked in brainstorm)

| Decision | Choice |
|----------|--------|
| Verification location | In the public core (`@productmap/sdk`), per spec — only signing stays private |
| Crypto scheme | **Ed25519** over a JSON entitlements payload, via Node `crypto` (zero new deps) |
| Token format | `base64url(JSON payload) + "." + base64url(signature)` |
| Bundle safety | Verifier ships as a **separate subpath export** (`@productmap/sdk/license`) — `node:crypto` must never enter the web bundle |

## Why a separate entry point (load-bearing)

`@productmap/sdk` is imported by both `apps/api` (Node) and `apps/web` (browser, via the slot/entitlements React layer). `node:crypto` is Node-only; if `verifyLicense` were re-exported from the package's main barrel (`@productmap/sdk` → `src/index.ts`), any web import of the barrel would pull `node:crypto` into the browser bundle and break the build. Therefore the verifier lives in its **own module** exposed as the `./license` subpath export and is **NOT** re-exported from `index.ts`. Only server code (`apps/api`, and the private edition's `LicenseKeyProvider`) imports `@productmap/sdk/license`.

## Data model

```ts
// the signed payload — a serializable form of Entitlements
export interface License {
  features: Feature[];          // subset of the existing Feature union
  limits: Record<LimitKey, number>; // -1 = unlimited
  expiresAt: number | null;     // epoch ms, null = never
}
```
`License` is the wire/serializable shape; `Entitlements` (existing, uses `ReadonlySet<Feature>`) is the in-memory shape. `verifyLicense` returns `Entitlements` (or null) so it drops straight into `createEntitlementProvider(snapshot)`.

## API (`packages/sdk/src/license.ts`, exported as `@productmap/sdk/license`)

```ts
/**
 * Verify a signed license token and return its entitlements, or null if the
 * token is malformed, the signature doesn't verify against publicKeyPem, or the
 * license has expired. Pure + stateless; no private key material here.
 *   token        = base64url(JSON License) + "." + base64url(ed25519 signature)
 *   publicKeyPem = SPKI PEM ed25519 public key (the edition bakes in its own)
 *   now          = injectable clock for testing (default Date.now())
 */
export function verifyLicense(
  token: string,
  publicKeyPem: string,
  now?: number,
): Entitlements | null;
```

Behavior:
- Split on the single `.`; base64url-decode both halves. Malformed (wrong parts, bad base64, non-JSON, missing fields) → `null` (never throws).
- `crypto.verify(null, payloadBytes, publicKey, signature)` where `payloadBytes` is the exact decoded payload bytes (sign/verify over the raw payload segment, not a re-serialization — avoids canonicalization drift). Bad signature → `null`.
- If `license.expiresAt != null && now >= license.expiresAt` → `null` (expired).
- Else build `Entitlements`: `{ features: new Set(license.features), limits: license.limits, expiresAt: license.expiresAt }` and return it.
- Validate `features` against the known `Feature` union and `limits` keys defensively (unknown feature strings dropped) so a tampered-but-unsigned-path can't smuggle values — though the signature check is the real gate.

No signing function and no key generation in the public core (those are F4b, private).

## Package wiring

- `packages/sdk/src/license.ts` — the verifier (imports `node:crypto`, and `Feature`/`LimitKey`/`Entitlements` types from `./entitlements`).
- `packages/sdk/package.json` `exports`: add a `"./license": "./src/license.ts"` subpath alongside the existing `"."`. Do **not** add `verifyLicense` to `src/index.ts`.
- `packages/sdk/README.md`: a short note under the Entitlements seam — verification is public + node-only via `@productmap/sdk/license`; signing/keys are private to the edition.

## Testing (`packages/sdk/src/license.test.ts`, runs in the sandbox)

Generate a throwaway Ed25519 keypair in the test (`crypto.generateKeyPairSync('ed25519')`), write a small local `signLicense(license, privateKey)` helper **in the test file only** (the public package ships no signer), and assert:
- valid token → returns the exact entitlements (features set, limits, expiresAt).
- signature tampered (flip a payload byte / wrong key) → `null`.
- malformed token (no `.`, bad base64, non-JSON, missing fields) → `null` (no throw).
- expired (`expiresAt` in the past via injected `now`) → `null`; not-yet-expired → returns entitlements.
- unknown feature strings in the payload are dropped from the returned set.

## Out of scope (F4b, private repo)
License **signing** + the key-generation CLI + the private signing key; `LicenseKeyProvider`; the analytics plugin; the submodule pin + private build/CI. After F4a merges, cut `v0.2.0` — the tag F4b pins its core submodule to (`v0.1.0` predates this verifier).

## Verification
`pnpm --filter @productmap/sdk test` green; `pnpm --filter @productmap/sdk exec tsc --noEmit` exit 0; confirm `@productmap/sdk/license` resolves and that the web build still works (verifier not in the web bundle) — `pnpm --filter @productmap/web build` exit 0.

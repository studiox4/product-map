# Open-core: dual-repo wiring (F3)

How the free **Community core** (this repo, `product-map`) and the private paid
**Team edition** (`productmap-cloud`) fit together. This is the F3 slice of the
open-core foundation; see the architecture spec
(`docs/superpowers/specs/2026-06-24-open-core-edition-architecture-design.md`)
and the seam contract (`packages/sdk/README.md`).

## Repos

| Repo | Visibility | Contains |
|------|-----------|----------|
| `product-map` (this) | **public, Apache-2.0** | Hono core (`apps/api`), web (`apps/web`), `packages/*`, the `@productmap/sdk` seam contracts, the demo, and a minimal landing. Boots and tests green with **zero plugins**. |
| `productmap-cloud` | **private** | Consumes the public core (pinned), registers into the five seams, and adds the paid features + `LicenseKeyProvider` + key-signing tooling. Builds the deployable cloud image. **Never patches core — only registers into it.** |

There is exactly **one** consumer of the seams (our own private repo) and we own
both, so the foundation deliberately skips a published package registry, strict
semver negotiation, and a separately-published conformance kit. Those are for a
*second, external* consumer (the plugin-marketplace future) and are out of scope.

## Cutting a core release

The private repo pins core to a **tag**. To cut one:

```bash
# on an up-to-date, green main
git tag vX.Y.Z
git push origin vX.Y.Z
```

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which:
1. **Verifies** the tagged commit — `pnpm build` (typecheck + bundle, all packages) + `pnpm test` (unit/integration).
2. **Publishes** a GitHub Release for the tag (auto-generated notes).

A red verify fails the release — no Release is published over a broken tag.
(The regular `ci.yml` already runs on every PR and push to `main`; the release
workflow re-verifies the exact tagged commit before publishing.)

## How the private repo pins core (git submodule)

`productmap-cloud` includes this repo as a **git submodule pinned to a release
tag** and builds the cloud image from source:

```bash
# one-time, in productmap-cloud
git submodule add https://github.com/<org>/product-map.git core
cd core && git checkout vX.Y.Z && cd ..
git add core .gitmodules && git commit -m "pin core vX.Y.Z"
```

To move to a newer core, check out the new tag inside the submodule and commit
the new pin:

```bash
cd core && git fetch --tags && git checkout vX.Y.Z+1 && cd ..
git add core && git commit -m "bump core to vX.Y.Z+1"
```

The private build composes the cloud app from `core/` + the private packages,
registering paid code into the seams (`serverPlugins.register(...)`,
`slotRegistry.register(...)`, `setEntitlementProvider(new LicenseKeyProvider(...))`,
`migrateStream(...)`). Because every registration goes through a public seam, the
private repo never edits core files.

> Alternative (not used for the foundation): a pnpm git-dependency on a tag/commit
> ref instead of a submodule. The submodule keeps the full source tree available
> for building the image and is the simpler mental model for one first-party consumer.

## Conformance = the private integration build

There is no separately-published conformance test-kit. **Building the full cloud
(core + private stub + paid features) and running its tests in the private CI is
the conformance check** — any seam breakage surfaces loudly there. Two pipelines:

- **Public CI** (`ci.yml`, `release.yml`): lint/typecheck/test/build core + demo +
  landing on every PR/push; verify + publish a Release on `v*` tags.
- **Private CI** (in `productmap-cloud`): pull the pinned core submodule, run paid +
  integration tests, build the cloud image, deploy.

## Local dual-repo development

Develop both repos together without cutting a release each time:

```bash
# check out both side by side
git clone https://github.com/<org>/product-map.git
git clone https://github.com/<org>/productmap-cloud.git

# point the private build at your LOCAL core checkout instead of the pinned
# submodule — pnpm workspace override (in productmap-cloud's package.json):
#   "pnpm": { "overrides": { "@productmap/sdk": "link:../product-map/packages/sdk" } }
# or use the submodule but `git checkout` a local working branch inside core/.
pnpm install
```

Edits to core's `packages/sdk` (or any core package) are then picked up by the
private build immediately. When done, bump the submodule pin to a real tag and
drop the override.

## Invariants this preserves

- Core's `apps/*` stay runnable standalone (Community + demo) — the deployable
  cloud artifact is built **only** in the private repo.
- No paid code or commercial architecture ever lands in this public repo.
- Core boots and tests green with **zero plugins** (enforced by F2's plugin
  registry test).

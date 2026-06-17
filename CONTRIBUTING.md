# Contributing to ProductMap

Thanks for your interest in improving ProductMap. This guide covers how to get a
dev environment running, the conventions we follow, and how to land a change.

## Development setup

Prerequisites: **Node 20+**, **pnpm 9+**, and **Postgres** running locally
([Postgres.app](https://postgresapp.com) on macOS works well).

```bash
# 1. Create the dev database (once)
createdb productmap

# 2. Install, migrate, seed, run
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open **http://localhost:5173**. The seed creates a dev admin you can log in with:

```
admin@productmap.local / devpassword123
```

> The dev server uses an ephemeral signing secret unless `AUTH_SECRET` is set, so
> sessions reset on API restart. For a stable dev session, add `AUTH_SECRET` to
> `apps/api/.env` (e.g. `AUTH_SECRET=$(openssl rand -hex 32)`).

## Project layout

```
apps/web        Vite + React + TanStack Query + Tiptap (UI)
apps/api        Hono REST API (auth, documents, roadmap, AI)
packages/db     Drizzle schema + migrations + seed
packages/shared Zod schemas + shared types
packages/templates  Document templates (PRD/BRD/...)
```

## Tests

```bash
createdb productmap_test   # once — integration tests need it
pnpm test                  # unit + integration (api, web, shared)
pnpm e2e                   # Playwright end-to-end
```

Every change should keep the suite green. Add tests for new behavior — the API
uses integration tests via `app.request(...)` (see `apps/api/src/routes/*.test.ts`),
and the web uses Vitest + Testing Library.

## Conventions

- **TypeScript everywhere.** Keep `pnpm --filter @productmap/api exec tsc --noEmit`
  and the web equivalent clean.
- **Follow existing patterns.** Match the file you're editing — naming, structure,
  error handling, comment density.
- **Validation at the edge.** Request bodies are validated with Zod schemas in
  `packages/shared`; reuse/extend those rather than hand-rolling checks.
- **Small, focused files.** Split by responsibility, not by layer.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:`...).

## Pull requests

1. Branch from `main`.
2. Make your change with tests; run `pnpm test` (and `pnpm e2e` if you touched
   user-facing flows).
3. Open a PR using the template. Fill in the summary and test plan.
4. CI must be green (typecheck, build, tests, e2e) before merge.

## Security

Please do not file public issues for security vulnerabilities — see
[SECURITY.md](SECURITY.md) for responsible disclosure.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.

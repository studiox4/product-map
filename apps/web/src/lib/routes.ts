/**
 * Single source of truth for in-app route paths (Phase 3A).
 *
 * The authenticated application lives under `/app/*`. Every in-app `<Link>`,
 * `<NavLink>`, `navigate(...)`, command-palette target, and `matchPath` check
 * must go through this module — never a raw string literal. A grep gate in CI
 * enforces it.
 *
 * - `appRoutes`  → concrete URL strings (no query/hash). Callers append
 *                  `?query`/`#hash` themselves: `appRoutes.board + '?feature=' + id`.
 * - `appPatterns`→ react-router path patterns for `matchPath`/equality checks.
 */
export const APP_BASE = '/app';

export const appRoutes = {
  dashboard: APP_BASE,
  board: `${APP_BASE}/board`,
  roadmap: `${APP_BASE}/roadmap`,
  inbox: `${APP_BASE}/inbox`,
  outcomes: `${APP_BASE}/outcomes`,
  releases: `${APP_BASE}/releases`,
  release: (id: string) => `${APP_BASE}/releases/${id}`,
  feature: (id: string) => `${APP_BASE}/features/${id}`,
  docs: `${APP_BASE}/docs`,
  doc: (id: string) => `${APP_BASE}/docs/${id}`,
  docRead: (id: string) => `${APP_BASE}/docs/${id}/read`,
  settings: `${APP_BASE}/settings`,
  settingsTab: (tab: string) => `${APP_BASE}/settings/${tab}`,
  templateEditor: (id: string) => `${APP_BASE}/settings/templates/${id}`,
} as const;

/** Path patterns for `matchPath`/equality context detection. */
export const appPatterns = {
  board: `${APP_BASE}/board`,
  feature: `${APP_BASE}/features/:id`,
  doc: `${APP_BASE}/docs/:id`,
} as const;

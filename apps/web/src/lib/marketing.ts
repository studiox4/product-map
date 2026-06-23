/**
 * Single source of truth for marketing repo + site coordinates.
 * Imported by the Marketing page sections AND the prerender script — keep it
 * free of React/DOM imports so the SSR/prerender step can consume it cleanly.
 */
export const REPO_OWNER = 'studiox4';
export const REPO_NAME = 'product-map';
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
export const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

/**
 * Canonical project domain baked into prerendered absolute og:url / og:image.
 * Each self-hosted instance has its own host (unknown at build time); previews
 * matter most when the *project* is shared, so we bake the canonical site.
 */
export const MARKETING_SITE_URL = 'https://productmap.x4.studio';

/** Shown when api.github.com is unreachable (offline / rate-limited / air-gapped).
 * 0 so we never display an inflated/fake count — the real star count loads
 * client-side from the public GitHub API. */
export const STARS_FALLBACK = 0;

export const HERO_HEADLINE = 'Your product roadmap. Self-hosted. Yours.';
export const HERO_SUBHEAD =
  'ProductMap is the self-hosted product workspace: now-next-later roadmaps, a feature hub with PRDs and docs, releases, and an AI copilot — all on infrastructure you own, with markdown that stays yours.';

export const META_TITLE = 'ProductMap — Self-hosted product roadmaps & docs';
export const META_DESCRIPTION =
  'Self-hosted product workspace: roadmaps, a feature hub with docs, releases, and an AI copilot. Offline-friendly, air-gapped-ready, your markdown is yours.';

/** OG image is a committed static asset; path is relative to the web root. */
export const OG_IMAGE_PATH = '/marketing/og-cover.png';

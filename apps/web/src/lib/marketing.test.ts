import { describe, expect, it } from 'vitest';
import {
  REPO_OWNER,
  REPO_NAME,
  REPO_URL,
  GITHUB_API_URL,
  MARKETING_SITE_URL,
  STARS_FALLBACK,
  HERO_HEADLINE,
  META_TITLE,
  META_DESCRIPTION,
  OG_IMAGE_PATH,
} from './marketing';

describe('marketing constants', () => {
  it('points REPO_URL at studiox4/product-map on github.com', () => {
    expect(REPO_OWNER).toBe('studiox4');
    expect(REPO_NAME).toBe('product-map');
    expect(REPO_URL).toBe('https://github.com/studiox4/product-map');
  });

  it('derives the GitHub API URL from owner/name', () => {
    expect(GITHUB_API_URL).toBe('https://api.github.com/repos/studiox4/product-map');
  });

  it('uses an absolute canonical site URL with no trailing slash', () => {
    expect(MARKETING_SITE_URL).toMatch(/^https:\/\//);
    expect(MARKETING_SITE_URL.endsWith('/')).toBe(false);
  });

  it('exposes a numeric stars fallback for air-gapped instances', () => {
    expect(typeof STARS_FALLBACK).toBe('number');
    // 0 is intentional — never show an inflated/fake count; the real count
    // loads client-side from the public GitHub API.
    expect(STARS_FALLBACK).toBeGreaterThanOrEqual(0);
  });

  it('exposes hero + meta copy and an OG image path under /marketing/', () => {
    expect(HERO_HEADLINE.length).toBeGreaterThan(0);
    expect(META_TITLE.length).toBeGreaterThan(0);
    expect(META_DESCRIPTION.length).toBeGreaterThan(0);
    expect(OG_IMAGE_PATH).toBe('/marketing/og-cover.png');
  });
});

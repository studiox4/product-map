import { describe, expect, it } from 'vitest';
import { APP_BASE, appRoutes, appPatterns } from './routes';

describe('appRoutes builders', () => {
  it('APP_BASE is /app', () => {
    expect(APP_BASE).toBe('/app');
  });

  it('static routes are prefixed', () => {
    expect(appRoutes.dashboard).toBe('/app');
    expect(appRoutes.board).toBe('/app/board');
    expect(appRoutes.roadmap).toBe('/app/roadmap');
    expect(appRoutes.inbox).toBe('/app/inbox');
    expect(appRoutes.outcomes).toBe('/app/outcomes');
    expect(appRoutes.releases).toBe('/app/releases');
    expect(appRoutes.docs).toBe('/app/docs');
    expect(appRoutes.settings).toBe('/app/settings');
  });

  it('parameterized routes build the full path', () => {
    expect(appRoutes.release('r1')).toBe('/app/releases/r1');
    expect(appRoutes.feature('f1')).toBe('/app/features/f1');
    expect(appRoutes.doc('d1')).toBe('/app/docs/d1');
    expect(appRoutes.docRead('d1')).toBe('/app/docs/d1/read');
    expect(appRoutes.settingsTab('workspace')).toBe('/app/settings/workspace');
    expect(appRoutes.templateEditor('t1')).toBe('/app/settings/templates/t1');
  });

  it('builders return clean base paths with no query/hash', () => {
    expect(appRoutes.board).not.toContain('?');
    expect(appRoutes.feature('f1')).not.toContain('#');
  });

  it('matchPath patterns carry the /app prefix', () => {
    expect(appPatterns.board).toBe('/app/board');
    expect(appPatterns.feature).toBe('/app/features/:id');
    expect(appPatterns.doc).toBe('/app/docs/:id');
  });
});

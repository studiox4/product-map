import { describe, it, expect } from 'vitest';
import { docBackLink } from './doc-back-link';

describe('docBackLink', () => {
  it('feature-owned docs link back to the board panel with the feature title', () => {
    expect(docBackLink({ featureId: 'f1', ideaId: null }, { featureTitle: 'Gantt' })).toEqual({
      href: '/board?feature=f1',
      label: 'Gantt',
    });
    expect(docBackLink({ featureId: 'f1', ideaId: null })).toEqual({
      href: '/board?feature=f1',
      label: 'Back to board',
    });
  });

  it('idea-owned docs link back to the inbox as "Idea: <title>"', () => {
    expect(
      docBackLink({ featureId: null, ideaId: 'i1' }, { ideaTitle: 'Bulk export' }),
    ).toEqual({ href: '/inbox?idea=i1', label: 'Idea: Bulk export' });
  });

  it('promoted pitch docs (feature + idea set) prefer the feature', () => {
    expect(
      docBackLink({ featureId: 'f1', ideaId: 'i1' }, { featureTitle: 'Export' }),
    ).toEqual({ href: '/board?feature=f1', label: 'Export' });
  });

  it('ownerless docs fall back to the docs library', () => {
    expect(docBackLink({ featureId: null, ideaId: null })).toEqual({
      href: '/docs',
      label: 'All docs',
    });
  });
});

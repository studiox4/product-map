import { describe, it, expect } from 'vitest';
import { TEMPLATES } from './index';

// Local copy so this test does not depend on Task 1A landing first.
const DOC_TYPES = ['prd', 'brd', 'tech_spec', 'feature_brief', 'idea_pitch', 'release_notes'] as const;

describe('TEMPLATES', () => {
  it('has an entry for all 6 doc types', () => {
    for (const type of DOC_TYPES) {
      expect(TEMPLATES[type], `missing template for ${type}`).toBeDefined();
      expect(TEMPLATES[type].type).toBe(type);
    }
    expect(Object.keys(TEMPLATES).sort()).toEqual([...DOC_TYPES].sort());
  });

  it('every markdownBody starts with the H1 placeholder line "# {{title}}"', () => {
    for (const type of DOC_TYPES) {
      const firstLine = TEMPLATES[type].markdownBody.split('\n')[0];
      expect(firstLine, `template ${type}`).toBe('# {{title}}');
    }
  });

  it('every markdownBody contains at least 4 "## " sections', () => {
    for (const type of DOC_TYPES) {
      const sections = TEMPLATES[type].markdownBody
        .split('\n')
        .filter((line) => line.startsWith('## '));
      expect(sections.length, `template ${type}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('every template has non-empty name, description and promptHints', () => {
    for (const type of DOC_TYPES) {
      expect(TEMPLATES[type].name.length, `name of ${type}`).toBeGreaterThan(0);
      expect(TEMPLATES[type].description.length, `description of ${type}`).toBeGreaterThan(0);
      expect(TEMPLATES[type].promptHints.trim().length, `promptHints of ${type}`).toBeGreaterThan(0);
    }
  });

  it('PRD body contains "## Requirements"', () => {
    expect(TEMPLATES.prd.markdownBody).toContain('## Requirements');
  });

  it('tech_spec body contains "## Proposed design"', () => {
    expect(TEMPLATES.tech_spec.markdownBody).toContain('## Proposed design');
  });

  it('brd body contains "## Business objectives"', () => {
    expect(TEMPLATES.brd.markdownBody).toContain('## Business objectives');
  });

  it('feature_brief body contains "## Success metric"', () => {
    expect(TEMPLATES.feature_brief.markdownBody).toContain('## Success metric');
  });

  it('idea_pitch body has the spec sections', () => {
    for (const section of [
      '## Problem',
      "## Who's asking (evidence)",
      '## Proposed direction',
      '## Why now',
      '## Open questions',
      '## Effort gut-check',
    ]) {
      expect(TEMPLATES.idea_pitch.markdownBody).toContain(section);
    }
  });

  it('release_notes body has the spec sections', () => {
    for (const section of ['## Highlights', "## What's new", '## Improvements', '## Fixes', '## Thanks']) {
      expect(TEMPLATES.release_notes.markdownBody).toContain(section);
    }
  });
});

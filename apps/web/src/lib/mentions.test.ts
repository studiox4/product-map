import { describe, it, expect } from 'vitest';
import { renderMentionsToText } from './mentions';

describe('renderMentionsToText', () => {
  it('renders a token as @Name', () => {
    expect(renderMentionsToText('hi @[Bob Lee](u-2) there')).toBe('hi @Bob Lee there');
  });
  it('leaves plain text untouched', () => {
    expect(renderMentionsToText('no tokens here')).toBe('no tokens here');
  });
});

const TOKEN = /@\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Render mention tokens to plain `@Name` for text display. */
export function renderMentionsToText(body: string): string {
  return body.replace(TOKEN, (_m, label: string) => `@${label}`);
}

/** Split a body into text + mention segments for chip rendering. */
export type MentionSegment = { type: 'text'; value: string } | { type: 'mention'; label: string; userId: string };
export function segmentMentions(body: string): MentionSegment[] {
  const out: MentionSegment[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: 'text', value: body.slice(last, idx) });
    out.push({ type: 'mention', label: m[1], userId: m[2] });
    last = idx + m[0].length;
  }
  if (last < body.length) out.push({ type: 'text', value: body.slice(last) });
  return out;
}

/** Replace a trailing `@query` ending at `caret` with a mention token + trailing space. */
export function insertMentionToken(
  body: string,
  caret: number,
  member: { userId: string; name: string },
): { next: string; caret: number } | null {
  const before = body.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  // Only a contiguous word (no whitespace) between @ and caret qualifies.
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  const token = `@[${member.name}](${member.userId}) `;
  const next = body.slice(0, at) + token + body.slice(caret);
  return { next, caret: at + token.length };
}

/** Extract the active `@query` at the caret, or null. */
export function activeMentionQuery(body: string, caret: number): string | null {
  const before = body.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return query;
}

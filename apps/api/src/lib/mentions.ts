/**
 * Extract trusted userIds from `@[label](userId)` mention tokens in a comment
 * body. Labels are display-only and ignored; only the parenthesized id is
 * returned. Result is de-duplicated in first-seen order. Pure — the caller
 * MUST still re-resolve these ids against project membership before use.
 */
const MENTION_TOKEN = /@\[[^\]]+\]\(([^)\s]+)\)/g;

export function parseMentionIds(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN)) {
    seen.add(match[1]);
  }
  return [...seen];
}

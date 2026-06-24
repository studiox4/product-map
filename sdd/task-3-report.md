# Task 3: Mention-token parser — Report

## Implementation Summary

Implemented a pure function `parseMentionIds(body: string): string[]` that extracts unique user IDs from `@[label](userId)` mention tokens in text. The function:

- Uses a regex `/(@\[[^\]]+\]\(([^)\s]+)\))/g` to match the mention token pattern
- De-duplicates IDs using a Set while preserving first-seen order
- Returns an array of extracted IDs

**Files created:**
- `apps/api/src/lib/mentions.ts` — implementation
- `apps/api/src/lib/mentions.test.ts` — test suite

## TDD Evidence

### Step 1-2: RED (Test without implementation)

```bash
$ pnpm --filter @productmap/api test -- src/lib/mentions.test.ts
 FAIL  src/lib/mentions.test.ts
Error: Failed to load url ./mentions (resolved id: ./mentions)
```

Module not found as expected.

### Step 3-4: GREEN (Test with implementation)

```bash
$ pnpm --filter @productmap/api test -- src/lib/mentions.test.ts
 ✓ src/lib/mentions.test.ts (4 tests) 2ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

All 4 tests passing:
1. Extracts the userId from a single token
2. De-dupes repeated IDs, preserving first-seen order
3. Returns empty array when there are no tokens
4. Ignores malformed tokens

## Commit

```
a0a2880 feat(api): mention-token parser
```

Two files changed, 32 insertions.

## Self-Review

**Correctness:** Implementation matches the brief specification exactly. Regex pattern correctly captures the userId in parentheses while excluding labels. Set-based de-duplication preserves insertion order via spread operator `[...seen]`.

**Test Coverage:** All four test cases from the brief are implemented and passing:
- Single mention extraction
- De-duplication with first-seen order preservation
- Empty string handling
- Malformed token rejection

**Code Quality:** Pure function with no side effects, no dependencies. Well-commented. Regex pattern is tight and correct.

**Concerns:** None. The implementation is straightforward, fully tested, and ready for integration.

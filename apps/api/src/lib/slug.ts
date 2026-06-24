// Project slug helpers. A slug is lowercase kebab, `^[a-z0-9]+(-[a-z0-9]+)*$`,
// max 60 chars, globally unique across projects.

const MAX = 60;

/** Derive a base slug from a free-text name. Always returns a valid, non-empty slug. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX)
    .replace(/-+$/g, '');
  return base || 'project';
}

/**
 * Collision-safe slug. Starts from `slugify(name)`; if `exists(candidate)`
 * resolves true, appends `-2`, `-3`, … (trimming the base so the suffix fits
 * within MAX) until a free one is found.
 */
export async function uniqueSlug(
  name: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name);
  if (!(await exists(base))) return base;
  for (let i = 2; ; i++) {
    const suffix = `-${i}`;
    const candidate = `${base.slice(0, MAX - suffix.length)}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
}

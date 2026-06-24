// Loads the real Drizzle migrations and applies them to an in-browser PGlite
// client. The 16 SQL files in packages/db/migrations are bundled as raw strings
// at build time; ordering comes from the Drizzle journal (idx ascending).
import type { PGlite } from '@electric-sql/pglite';
import journal from '../../../../packages/db/migrations/meta/_journal.json';

// Eagerly bundle every migration SQL file as a raw string. The glob path is
// relative to THIS file: src/demo → src → web → apps → repo root (4 × ../),
// then packages/db/migrations/*.sql. Verified to match all 14 files.
const sqlByPath = import.meta.glob('../../../../packages/db/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface JournalEntry {
  idx: number;
  tag: string;
}

/** Migration SQL strings in journal order (idx ascending), keyed by tag. */
function orderedMigrations(): string[] {
  const entries = ([...(journal as { entries: JournalEntry[] }).entries]).sort(
    (a, b) => a.idx - b.idx,
  );

  // Map each glob result to its bare `<tag>.sql` filename for journal lookup.
  const byTag = new Map<string, string>();
  for (const [path, sql] of Object.entries(sqlByPath)) {
    const file = path.split('/').pop()!; // e.g. "0000_safe_red_skull.sql"
    byTag.set(file.replace(/\.sql$/, ''), sql);
  }

  return entries.map((e) => {
    const sql = byTag.get(e.tag);
    if (sql == null) {
      throw new Error(`Demo migrations: no SQL file for journal tag "${e.tag}"`);
    }
    return sql;
  });
}

/**
 * Apply all migrations in order against a raw PGlite client. Each file is split
 * ONLY on the literal `--> statement-breakpoint` marker (NEVER on `;` — migration
 * 0011 contains a `DO $$ ... END $$` block with internal semicolons). Each
 * non-empty chunk is exec'd as one statement group.
 */
export async function applyMigrations(client: PGlite): Promise<void> {
  for (const file of orderedMigrations()) {
    const chunks = file
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const chunk of chunks) {
      await client.exec(chunk);
    }
  }
}

/** Exposed for the test: confirms the glob matched all 16 migration files. */
export function migrationCount(): number {
  return Object.keys(sqlByPath).length;
}

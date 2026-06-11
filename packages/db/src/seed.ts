// CLI seed runner (tsx). The markdown→Tiptap converter lives in the api app's
// lib (it owns the Tiptap extension list); import it directly by path — tsx
// resolves @tiptap/* from apps/api/node_modules since resolution is relative
// to the imported file.
import { createDb } from './index';
import { seedDemo } from './seed-data';
// eslint-disable-next-line import/no-relative-packages
import { markdownToTiptap } from '../../../apps/api/src/lib/markdown';

const connectionString = process.env.DATABASE_URL ?? 'postgres://localhost:5432/productmap';
const { db, pool } = createDb(connectionString);

try {
  await seedDemo(db, markdownToTiptap);
} finally {
  await pool.end();
}

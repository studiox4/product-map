import { sql } from 'drizzle-orm';
import { createDb } from './index';

const connectionString = process.env.DATABASE_URL ?? 'postgres://localhost:5432/productmap';

const { db, pool } = createDb(connectionString);
try {
  await db.execute(sql`truncate table uploads, documents, features, products restart identity cascade`);
  console.log('database reset (all tables truncated)');
} finally {
  await pool.end();
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './index';

const connectionString = process.env.DATABASE_URL ?? 'postgres://localhost:5432/productmap';
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const { db, pool } = createDb(connectionString);
try {
  await migrate(db, { migrationsFolder });
  console.log('migrations applied');
} finally {
  await pool.end();
}

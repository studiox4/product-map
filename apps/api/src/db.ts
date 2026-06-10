import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { schema } from '@productmap/db';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://localhost:5432/productmap';

export const pool = new pg.Pool({ connectionString });
export const db = drizzle(pool, { schema });

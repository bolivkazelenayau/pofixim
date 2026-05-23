import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { exercises } from '../src/server/db/schema';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const ex = await db.select().from(exercises).where(eq(exercises.id, 'ege10-bank-52985')).limit(1);
  if (ex.length > 0) {
    console.log(ex[0].explanation);
  } else {
    console.log('Not found');
  }
  pool.end();
}
main().catch(console.error);

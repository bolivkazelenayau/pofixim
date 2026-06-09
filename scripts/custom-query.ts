import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { exercises } from '../src/db/schema';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);
  try {
    const ex = await db
      .select()
      .from(exercises)
      .where(eq(exercises.seedKey, 'ege10-bank-52985'))
      .limit(1);
    if (ex.length > 0) {
      console.log(ex[0].explanation);
    } else {
      console.log('Not found');
    }
  } finally {
    await sql.end();
  }
}
main().catch(console.error);

import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL);

try {
  await sql`alter type exercise_type add value if not exists 'orthography_repair'`;
  console.log('OK: exercise_type includes orthography_repair');
} finally {
  await sql.end();
}

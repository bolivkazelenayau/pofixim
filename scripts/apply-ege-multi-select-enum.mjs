import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const sql = postgres(connectionString);

try {
  await sql`ALTER TYPE "exercise_type" ADD VALUE IF NOT EXISTS 'ege_multi_select'`;
  console.log('exercise_type enum updated with ege_multi_select');
} finally {
  await sql.end();
}

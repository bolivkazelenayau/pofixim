import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL);

try {
  await sql`ALTER TYPE "exercise_type" ADD VALUE IF NOT EXISTS 'ege20_complex_sentence_punctuation'`;
  console.log('Enum value added (or already existed).');
} finally {
  await sql.end();
}

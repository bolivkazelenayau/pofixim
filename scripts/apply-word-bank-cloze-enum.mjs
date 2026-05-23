import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL);

try {
  await sql`alter type exercise_type add value if not exists 'word_bank_cloze'`;
  console.log('OK: exercise_type includes word_bank_cloze');
} finally {
  await sql.end();
}


import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL);

try {
  await sql.unsafe(`
    create index if not exists exercises_skill_tags_gin_idx
    on exercises using gin (skill_tags)
  `);
  console.log('OK: exercises_skill_tags_gin_idx exists');
} finally {
  await sql.end();
}

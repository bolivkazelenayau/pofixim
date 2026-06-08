import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL);

try {
  const counts = await sql.unsafe(`
    select
      count(1)::int as total,
      count(1) filter (where type = 'orthography_repair')::int as orthography_repair
    from exercises
  `);
  const indexes = await sql.unsafe(`
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'public' and tablename = 'exercises'
    order by indexname
  `);

  console.log(JSON.stringify({ counts: counts[0], indexes }, null, 2));
} finally {
  await sql.end();
}

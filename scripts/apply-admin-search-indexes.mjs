import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL);

try {
  await sql`create extension if not exists pg_trgm`;

  await sql`drop index if exists exercises_search_blob_trgm_idx`;
  await sql`drop index if exists exercises_search_trgm_idx`;

  await sql.unsafe(`
    create index if not exists exercises_search_blob_trgm_idx
    on exercises using gin (
      lower(
        replace(
          coalesce(seed_key, '') || ' ' ||
          coalesce(prompt, '') || ' ' ||
          coalesce(explanation, '') || ' ' ||
          payload::text || ' ' ||
          answer::text,
          chr(173),
          ''
        )
      ) gin_trgm_ops
    )
  `);

  await sql.unsafe(`
    create index if not exists exercises_search_trgm_idx
    on exercises using gin (
      lower(
        regexp_replace(
          regexp_replace(
            replace(
              coalesce(seed_key, '') || ' ' ||
              coalesce(prompt, '') || ' ' ||
              coalesce(explanation, '') || ' ' ||
              payload::text || ' ' ||
              answer::text,
              chr(173),
              ''
            ),
            '[*_~\\[\\]()<>{}|\\\\]',
            '',
            'g'
          ),
          '\\s+',
          ' ',
          'g'
        )
      ) gin_trgm_ops
    )
  `);

  console.log('OK: admin search trigram indexes include payload and answer');
} finally {
  await sql.end();
}

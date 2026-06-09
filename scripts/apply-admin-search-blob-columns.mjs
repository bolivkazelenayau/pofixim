import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const searchBlobExpression = `
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
  )
`;

const normalizedSearchBlobExpression = `
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
  )
`;

try {
  if (process.argv.includes('--verify')) {
    const rows = await sql.unsafe(`
      select
        count(*)::int as total,
        count(*) filter (where search_blob is null)::int as null_blob,
        count(*) filter (where search_blob_normalized is null)::int as null_normalized
      from exercises
    `);
    const triggers = await sql.unsafe(`
      select tgname
      from pg_trigger
      where tgname = 'exercises_set_search_blobs_trigger'
    `);
    const indexes = await sql.unsafe(`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'exercises'
        and indexname like 'exercises_search_blob%materialized%'
      order by indexname
    `);
    console.log(JSON.stringify({ counts: rows[0], triggers, indexes }, null, 2));
    process.exit(0);
  }

  await sql`create extension if not exists pg_trgm`;

  await sql`
    alter table exercises
    add column if not exists search_blob text
  `;

  await sql`
    alter table exercises
    add column if not exists search_blob_normalized text
  `;

  await sql.unsafe(`
    update exercises
    set
      search_blob = ${searchBlobExpression},
      search_blob_normalized = ${normalizedSearchBlobExpression}
  `);

  await sql.unsafe(`
    create or replace function exercises_set_search_blobs()
    returns trigger
    language plpgsql
    as $$
    begin
      new.search_blob := ${searchBlobExpression.replaceAll('seed_key', 'new.seed_key')
    .replaceAll('prompt', 'new.prompt')
    .replaceAll('explanation', 'new.explanation')
    .replaceAll('payload', 'new.payload')
    .replaceAll('answer', 'new.answer')};
      new.search_blob_normalized := ${normalizedSearchBlobExpression.replaceAll('seed_key', 'new.seed_key')
    .replaceAll('prompt', 'new.prompt')
    .replaceAll('explanation', 'new.explanation')
    .replaceAll('payload', 'new.payload')
    .replaceAll('answer', 'new.answer')};
      return new;
    end;
    $$;
  `);

  await sql`
    drop trigger if exists exercises_set_search_blobs_trigger on exercises
  `;

  await sql`
    create trigger exercises_set_search_blobs_trigger
    before insert or update of seed_key, prompt, explanation, payload, answer
    on exercises
    for each row
    execute function exercises_set_search_blobs()
  `;

  await sql`
    create index if not exists exercises_search_blob_materialized_trgm_idx
    on exercises using gin (search_blob gin_trgm_ops)
  `;

  await sql`
    create index if not exists exercises_search_blob_normalized_materialized_trgm_idx
    on exercises using gin (search_blob_normalized gin_trgm_ops)
  `;

  await sql`
    drop index if exists exercises_search_blob_trgm_idx
  `;

  await sql`
    drop index if exists exercises_search_trgm_idx
  `;

  await sql`analyze exercises`;

  console.log('OK: admin search blob columns, trigger, and indexes are ready');
} finally {
  await sql.end();
}

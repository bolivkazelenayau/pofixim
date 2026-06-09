import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

async function measure(name, fn, options = {}) {
  const warmup = options.warmup ?? 5;
  const runs = options.runs ?? 60;
  for (let index = 0; index < warmup; index += 1) {
    await fn();
  }

  const times = [];
  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    await fn();
    times.push(performance.now() - startedAt);
  }

  return {
    name,
    runs,
    min: Number(Math.min(...times).toFixed(2)),
    p50: Number(percentile(times, 50).toFixed(2)),
    p90: Number(percentile(times, 90).toFixed(2)),
    p95: Number(percentile(times, 95).toFixed(2)),
    max: Number(Math.max(...times).toFixed(2)),
  };
}

const listSelect = `
  select
    id,
    type,
    skill_tags as "skillTags",
    seed_key as "seedKey",
    prompt,
    '' as explanation,
    quality_status as "qualityStatus",
    updated_at::text as "updatedAt",
    updated_at::text as "updatedAtCursor",
    is_active as "isActive"
  from exercises
`;

const blobExpr = `search_blob`;
const normalizedBlobExpr = `search_blob_normalized`;

function searchCondition(input) {
  const pattern = input.pattern;
  const blobPattern = input.blobPattern;
  const normalizedPattern = input.normalizedPattern;
  const includeNormalizedBlob = input.includeNormalizedBlob;
  return includeNormalizedBlob
    ? `(
        (cast(id as text) ilike '${pattern}' or lower(coalesce(seed_key, '')) like '${pattern}')
        or ${blobExpr} like '${blobPattern}'
        or ${normalizedBlobExpr} like '${normalizedPattern}'
      )`
    : `(
        (cast(id as text) ilike '${pattern}' or lower(coalesce(seed_key, '')) like '${pattern}')
        or ${blobExpr} like '${blobPattern}'
      )`;
}

function normalizeSearchQuery(input) {
  return input.toLowerCase().replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();
}

function shouldUseNormalizedBlobSearch(input) {
  return /[*_~[\]()<>{}|\\]/u.test(input) || /\s{2,}/u.test(input);
}

function actionLikeSearchSql(query) {
  const lower = query.toLowerCase().replace(/'/g, "''");
  const normalized = normalizeSearchQuery(query).replace(/'/g, "''");
  return `${listSelect}
    where id is not null
      and ${searchCondition({
        pattern: `%${lower}%`,
        blobPattern: `%${normalized}%`,
        normalizedPattern: `%${normalized}%`,
        includeNormalizedBlob: shouldUseNormalizedBlobSearch(query),
      })}
    order by id desc
    limit 101`;
}

async function listActionLikeSearch(query) {
  const lower = query.toLowerCase();
  const normalized = normalizeSearchQuery(query);
  const isDigitsOnly = /^\d+$/u.test(query);
  const isSeedKeyLike = /^[a-z0-9:_-]+$/iu.test(query) && /[a-z:_-]/iu.test(query);
  const fastQueryShouldShortCircuit = isSeedKeyLike || (isDigitsOnly && query.length >= 3);

  const fastRows = isDigitsOnly || isSeedKeyLike
    ? await sql.unsafe(
        `${listSelect}
         where id is not null
           and (cast(id as text) ilike $1 or lower(coalesce(seed_key, '')) like $1)
         order by id desc
         limit 101`,
        [`%${lower}%`],
      )
    : [];

  if (fastRows.length > 0 && (fastQueryShouldShortCircuit || fastRows.length > 100)) {
    return fastRows;
  }

  const blobRows = await sql.unsafe(
    `${listSelect}
     where id is not null
       and ${blobExpr} like $1
     order by id desc
     limit 101`,
    [`%${normalized}%`],
  );

  if (!shouldUseNormalizedBlobSearch(query)) {
    return [...fastRows, ...blobRows];
  }

  const normalizedRows = await sql.unsafe(
    `${listSelect}
     where id is not null
       and ${normalizedBlobExpr} like $1
     order by id desc
     limit 101`,
    [`%${normalized}%`],
  );

  return [...fastRows, ...blobRows, ...normalizedRows];
}

try {
  if (process.argv.includes('--analyze')) {
    await sql`analyze exercises`;
    console.log('ANALYZE exercises OK');
    process.exit(0);
  }

  if (process.argv.includes('--explain')) {
    for (const [name, expression] of [
      ['blob', blobExpr],
      ['normalized', normalizedBlobExpr],
    ]) {
      if (process.argv.includes('--force-index')) {
        await sql`set enable_seqscan = off`;
      }
      if (process.argv.includes('--force-order-index')) {
        await sql`set enable_seqscan = off`;
        await sql`set enable_bitmapscan = off`;
      }
      const rows = await sql.unsafe(
        `explain (analyze, buffers, format text)
         ${listSelect}
         where id is not null
           and ${expression} like $1
         order by id desc
         limit 101`,
        ['%не подходит%'],
      );
      console.log(`--- ${name}`);
      console.log(rows.map((row) => row['QUERY PLAN']).join('\n'));
    }
    process.exit(0);
  }

  const [latest] = await sql`select id from exercises order by id desc limit 1`;
  const [cursor] = await sql`
    select id, updated_at::text as updated_at
    from exercises
    order by updated_at desc, id desc
    offset 100
    limit 1
  `;
  const [count] = await sql`select count(*)::int as count from exercises`;

  const tests = [
    ['refresh id desc limit100', () =>
      sql.unsafe(`${listSelect} where id is not null order by id desc limit 101`),
    ],
    ['refresh updatedAt desc limit100', () =>
      sql.unsafe(`${listSelect} where id is not null order by updated_at desc, id desc limit 101`),
    ],
    ['refresh updatedAt desc + count', async () => {
      await sql.unsafe(`${listSelect} where id is not null order by updated_at desc, id desc limit 101`);
      await sql`select count(*)::int from exercises where id is not null`;
    }],
    ['loadMore updatedAt cursor limit100', () =>
      sql.unsafe(
        `${listSelect}
         where id is not null
           and (updated_at < $1::text::timestamp or (updated_at = $1::text::timestamp and id < $2))
         order by updated_at desc, id desc
        limit 101`,
        [cursor.updated_at, cursor.id],
      ),
    ],
    ['detail by id', () =>
      sql`select * from exercises where id = ${latest.id} limit 1`,
    ],
    ['search id exact-like', () =>
      sql.unsafe(
        `${listSelect}
         where id is not null
           and (cast(id as text) ilike $1 or lower(coalesce(seed_key, '')) like $1)
         order by id desc
        limit 101`,
        [`%${latest.id}%`],
      ),
    ],
    ['search seed-like dictation', () =>
      sql.unsafe(
        `${listSelect}
         where id is not null
           and (cast(id as text) ilike $1 or lower(coalesce(seed_key, '')) like $1)
         order by id desc
        limit 101`,
        ['%dictation-small%'],
      ),
    ],
    ['search blob common russian', () =>
      sql.unsafe(
        `${listSelect}
         where id is not null
           and ${blobExpr} like $1
         order by id desc
         limit 101`,
        ['%не подходит%'],
      ),
    ],
    ['search normalized markdown-ish', () =>
      sql.unsafe(
        `${listSelect}
         where id is not null
           and ${normalizedBlobExpr} like $1
         order by id desc
         limit 101`,
        ['%не подходит%'],
      ),
    ],
    ['filter ege.13 updatedAt', () =>
      sql.unsafe(
        `${listSelect}
         where id is not null
           and skill_tags @> array['ege.13']::text[]
         order by updated_at desc, id desc
         limit 101`,
      ),
    ],
    ['action-like search id', () =>
      sql.unsafe(actionLikeSearchSql(String(latest.id))),
    ],
    ['listExercises branch search id', () =>
      listActionLikeSearch(String(latest.id)),
    ],
    ['action-like search seed-like', () =>
      sql.unsafe(actionLikeSearchSql('dictation-small')),
    ],
    ['listExercises branch search seed-like', () =>
      listActionLikeSearch('dictation-small'),
    ],
    ['action-like search plain text', () =>
      sql.unsafe(actionLikeSearchSql('не подходит')),
    ],
    ['listExercises branch search plain text', () =>
      listActionLikeSearch('не подходит'),
    ],
    ['action-like search markdown text', () =>
      sql.unsafe(actionLikeSearchSql('**не подходит**')),
    ],
    ['listExercises branch search markdown text', () =>
      listActionLikeSearch('**не подходит**'),
    ],
  ];

  const results = [];
  for (const [name, fn] of tests) {
    results.push(await measure(name, fn));
  }
  const indexes = await sql`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'exercises'
    order by indexname
  `;

  console.log(JSON.stringify({
    totalExercises: count.count,
    sampleId: latest.id,
    updatedAtCursor: cursor,
    results,
    indexes: indexes.map((item) => item.indexname),
  }, null, 2));
} finally {
  await sql.end();
}

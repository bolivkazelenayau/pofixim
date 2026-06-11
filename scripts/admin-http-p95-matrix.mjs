import 'dotenv/config';
import { createHmac } from 'node:crypto';
import postgres from 'postgres';

const baseUrl = process.env.ADMIN_HTTP_BENCH_BASE_URL || 'http://localhost:3000';
const runs = Number(process.env.ADMIN_HTTP_BENCH_MATRIX_RUNS || process.env.ADMIN_HTTP_BENCH_RUNS || 25);
const warmup = Number(process.env.ADMIN_HTTP_BENCH_MATRIX_WARMUP || process.env.ADMIN_HTTP_BENCH_WARMUP || 3);
const samplesPerType = Number(process.env.ADMIN_HTTP_BENCH_TYPE_SAMPLES || 1);
const requestedExamTypes = (process.env.ADMIN_HTTP_BENCH_EXAM_TYPES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

if (!process.env.ADMIN_SESSION_SECRET) {
  throw new Error('ADMIN_SESSION_SECRET is required');
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function createAdminSessionCookie() {
  const expiresAt = String(Date.now() + 8 * 60 * 60 * 1000);
  const signature = createHmac('sha256', process.env.ADMIN_SESSION_SECRET)
    .update(expiresAt)
    .digest('base64url');
  return `admin_session=${expiresAt}.${signature}`;
}

function listPath(params) {
  const search = new URLSearchParams({
    limit: String(params.limit ?? 100),
    offset: '0',
    query: '',
    type: params.type ?? 'all',
    qualityStatus: params.qualityStatus ?? 'all',
    examType: params.examType ?? 'all',
    sortBy: params.sortBy ?? 'updatedAt',
    sortDir: params.sortDir ?? 'desc',
    includeTotal: 'true',
  });
  return `/api/admin/exercises?${search.toString()}`;
}

async function timedFetch(path, cookie) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      cookie,
    },
  });
  await response.arrayBuffer();
  return {
    status: response.status,
    durationMs: performance.now() - startedAt,
  };
}

async function measure(name, path, cookie) {
  for (let index = 0; index < warmup; index += 1) {
    await timedFetch(path, cookie);
  }

  const times = [];
  const statuses = new Map();
  for (let index = 0; index < runs; index += 1) {
    const result = await timedFetch(path, cookie);
    times.push(result.durationMs);
    statuses.set(result.status, (statuses.get(result.status) ?? 0) + 1);
  }

  return {
    name,
    path,
    runs,
    statuses: Object.fromEntries(statuses),
    min: Number(Math.min(...times).toFixed(2)),
    p50: Number(percentile(times, 50).toFixed(2)),
    p90: Number(percentile(times, 90).toFixed(2)),
    p95: Number(percentile(times, 95).toFixed(2)),
    max: Number(Math.max(...times).toFixed(2)),
  };
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const typeRows = await sql`
    with ranked as (
      select
        id,
        type::text as type,
        seed_key,
        row_number() over (partition by type order by updated_at desc, id desc) as rank
      from exercises
      where is_active = true
    )
    select id, type, seed_key
    from ranked
    where rank <= ${samplesPerType}
    order by type, rank
  `;

  if (typeRows.length === 0) {
    throw new Error('No active exercises found');
  }

  const statusRows = await sql`
    select quality_status::text as status, count(*)::int as count
    from exercises
    group by quality_status
    order by quality_status
  `;

  const examRows = requestedExamTypes.length > 0
    ? await sql`
      select regexp_replace(tag, '^ege\\.', '') as exam_type, count(*)::int as count
      from exercises, unnest(skill_tags) as tag
      where tag = any(${requestedExamTypes.map((examType) => `ege.${examType}`)})
      group by tag
      order by tag
    `
    : await sql`
      select regexp_replace(tag, '^ege\\.', '') as exam_type, count(*)::int as count
      from exercises, unnest(skill_tags) as tag
      where tag ~ '^ege\\.[0-9]+$'
      group by tag
      order by count(*) desc, tag
      limit 8
    `;

  const cookie = createAdminSessionCookie();
  const tests = [
    ['list all updatedAt', listPath({})],
    ['list all id', listPath({ sortBy: 'id' })],
  ];

  for (const row of statusRows) {
    tests.push([
      `list status ${row.status}`,
      listPath({ qualityStatus: row.status }),
    ]);
  }

  for (const row of examRows) {
    tests.push([
      `list ege ${row.exam_type}`,
      listPath({ examType: row.exam_type }),
    ]);
  }

  const seenTypes = new Set();
  for (const row of typeRows) {
    if (!seenTypes.has(row.type)) {
      tests.push([
        `list type ${row.type}`,
        listPath({ type: row.type }),
      ]);
      seenTypes.add(row.type);
    }
    tests.push([`detail ${row.type} #${row.id}`, `/api/admin/exercises/${row.id}`]);
    tests.push([`page ${row.type} #${row.id}`, `/admin?exercise=${row.id}`]);
  }

  const results = [];
  for (const [name, path] of tests) {
    results.push(await measure(name, path, cookie));
  }

  console.log(JSON.stringify({
    baseUrl,
    runs,
    warmup,
    samplesPerType,
    requestedExamTypes,
    sampledExercises: typeRows,
    statusCounts: statusRows,
    examCounts: examRows,
    results,
  }, null, 2));
} finally {
  await sql.end();
}

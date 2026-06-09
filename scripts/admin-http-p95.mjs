import 'dotenv/config';
import { createHmac } from 'node:crypto';
import postgres from 'postgres';

const baseUrl = process.env.ADMIN_HTTP_BENCH_BASE_URL || 'http://localhost:3000';
const runs = Number(process.env.ADMIN_HTTP_BENCH_RUNS || 25);
const warmup = Number(process.env.ADMIN_HTTP_BENCH_WARMUP || 3);

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
  const [latest] = await sql`
    select id
    from exercises
    order by updated_at desc, id desc
    limit 1
  `;
  if (!latest?.id) {
    throw new Error('No exercises found');
  }

  const cookie = createAdminSessionCookie();
  const listPath = '/api/admin/exercises?limit=100&offset=0&query=&type=all&qualityStatus=all&examType=all&sortBy=updatedAt&sortDir=desc&includeTotal=true';
  const tests = [
    ['admin page refresh', `/admin?exercise=${latest.id}`],
    ['admin detail api', `/api/admin/exercises/${latest.id}`],
    ['admin list api', listPath],
  ];

  const results = [];
  for (const [name, path] of tests) {
    results.push(await measure(name, path, cookie));
  }

  console.log(JSON.stringify({
    baseUrl,
    sampleId: latest.id,
    warmup,
    results,
  }, null, 2));
} finally {
  await sql.end();
}

import 'dotenv/config';
import { createHmac } from 'node:crypto';
import postgres from 'postgres';

const baseUrl = process.env.CONCURRENT_HTTP_BENCH_BASE_URL
  || process.env.MAIN_HTTP_BENCH_BASE_URL
  || process.env.ADMIN_HTTP_BENCH_BASE_URL
  || 'http://localhost:3000';
const workers = Number(process.env.CONCURRENT_HTTP_BENCH_WORKERS || 50);
const requestsPerWorker = Number(process.env.CONCURRENT_HTTP_BENCH_REQUESTS_PER_WORKER || 20);
const warmup = Number(process.env.CONCURRENT_HTTP_BENCH_WARMUP || 20);
const target = process.env.CONCURRENT_HTTP_BENCH_TARGET || 'mixed';
const timeoutMs = Number(process.env.CONCURRENT_HTTP_BENCH_TIMEOUT_MS || 15000);

if (!process.env.ADMIN_SESSION_SECRET) {
  throw new Error('ADMIN_SESSION_SECRET is required');
}

if (!Number.isInteger(workers) || workers <= 0) {
  throw new Error('CONCURRENT_HTTP_BENCH_WORKERS must be a positive integer');
}

if (!Number.isInteger(requestsPerWorker) || requestsPerWorker <= 0) {
  throw new Error('CONCURRENT_HTTP_BENCH_REQUESTS_PER_WORKER must be a positive integer');
}

function createAdminSessionCookie() {
  const expiresAt = String(Date.now() + 8 * 60 * 60 * 1000);
  const signature = createHmac('sha256', process.env.ADMIN_SESSION_SECRET)
    .update(expiresAt)
    .digest('base64url');
  return `admin_session=${expiresAt}.${signature}`;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function summarize(times) {
  if (times.length === 0) {
    return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  }

  return {
    min: Number(Math.min(...times).toFixed(2)),
    p50: Number(percentile(times, 50).toFixed(2)),
    p90: Number(percentile(times, 90).toFixed(2)),
    p95: Number(percentile(times, 95).toFixed(2)),
    p99: Number(percentile(times, 99).toFixed(2)),
    max: Number(Math.max(...times).toFixed(2)),
  };
}

function weightedPick(items, index) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = (index * 17) % total;

  for (const item of items) {
    if (cursor < item.weight) return item;
    cursor -= item.weight;
  }

  return items[items.length - 1];
}

async function loadAdminSamples() {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    return await sql`
      select id, type::text as type
      from exercises
      where is_active = true
      order by updated_at desc, id desc
      limit 12
    `;
  } finally {
    await sql.end();
  }
}

async function buildRoutes() {
  const samples = await loadAdminSamples();
  const sample = samples[0];
  const sampleId = sample?.id;
  const routes = [];

  if (target === 'main' || target === 'mixed') {
    routes.push(
      { name: 'main next', path: '/api/bench/main?case=next&limit=80', weight: 8 },
      { name: 'main next-seen', path: '/api/bench/main?case=next-seen&limit=80', weight: 6 },
      { name: 'main blitz', path: '/api/bench/main?case=blitz&limit=80', weight: 3 },
      { name: 'main ege13', path: '/api/bench/main?case=ege13&limit=80', weight: 3 },
      { name: 'main ege15', path: '/api/bench/main?case=ege15&limit=80', weight: 3 },
    );
  }

  if (target === 'admin' || target === 'mixed') {
    routes.push(
      {
        name: 'admin list all',
        path: '/api/admin/exercises?limit=100&offset=0&query=&type=all&qualityStatus=all&examType=all&sortBy=updatedAt&sortDir=desc&includeTotal=true',
        weight: 8,
      },
      {
        name: 'admin list review',
        path: '/api/admin/exercises?limit=100&offset=0&query=&type=all&qualityStatus=review&examType=all&sortBy=updatedAt&sortDir=desc&includeTotal=true',
        weight: 4,
      },
      {
        name: 'admin list ege15',
        path: '/api/admin/exercises?limit=100&offset=0&query=&type=all&qualityStatus=all&examType=15&sortBy=updatedAt&sortDir=desc&includeTotal=true',
        weight: 3,
      },
    );

    if (sampleId) {
      routes.push(
        { name: 'admin detail', path: `/api/admin/exercises/${sampleId}`, weight: 5 },
        { name: 'admin page', path: `/admin?exercise=${sampleId}`, weight: 2 },
      );
    }
  }

  if (routes.length === 0) {
    throw new Error(`Unsupported CONCURRENT_HTTP_BENCH_TARGET: ${target}`);
  }

  return routes;
}

async function timedFetch(route, cookie) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(`${baseUrl}${route.path}`, {
      headers: { cookie },
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return {
      route: route.name,
      status: response.status,
      durationMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      route: route.name,
      status: 'error',
      error: error instanceof Error ? error.name : String(error),
      durationMs: performance.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runWorker(workerIndex, routes, cookie) {
  const results = [];

  for (let requestIndex = 0; requestIndex < requestsPerWorker; requestIndex += 1) {
    const route = weightedPick(routes, workerIndex + requestIndex * workers);
    results.push(await timedFetch(route, cookie));
  }

  return results;
}

const routes = await buildRoutes();
const cookie = createAdminSessionCookie();

for (let index = 0; index < warmup; index += 1) {
  const route = weightedPick(routes, index);
  await timedFetch(route, cookie);
}

const startedAt = performance.now();
const workerResults = await Promise.all(
  Array.from({ length: workers }, (_, index) => runWorker(index, routes, cookie)),
);
const durationMs = performance.now() - startedAt;
const results = workerResults.flat();
const successTimes = results
  .filter((result) => typeof result.status === 'number' && result.status >= 200 && result.status < 400)
  .map((result) => result.durationMs);
const statuses = new Map();
const routeStats = new Map();

for (const result of results) {
  statuses.set(String(result.status), (statuses.get(String(result.status)) ?? 0) + 1);
  const current = routeStats.get(result.route) ?? [];
  current.push(result.durationMs);
  routeStats.set(result.route, current);
}

console.log(JSON.stringify({
  baseUrl,
  target,
  workers,
  requestsPerWorker,
  requests: results.length,
  warmup,
  durationMs: Number(durationMs.toFixed(2)),
  throughputRps: Number((results.length / (durationMs / 1000)).toFixed(2)),
  statuses: Object.fromEntries(statuses),
  latencyMs: summarize(successTimes),
  routes: Object.fromEntries(
    [...routeStats.entries()].map(([name, times]) => [
      name,
      {
        requests: times.length,
        ...summarize(times),
      },
    ]),
  ),
}, null, 2));

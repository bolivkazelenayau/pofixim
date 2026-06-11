import 'dotenv/config';
import { createHmac } from 'node:crypto';

const baseUrl = process.env.MAIN_HTTP_BENCH_BASE_URL
  || process.env.ADMIN_HTTP_BENCH_BASE_URL
  || 'http://localhost:3000';
const runs = Number(process.env.MAIN_HTTP_BENCH_RUNS || process.env.ADMIN_HTTP_BENCH_RUNS || 25);
const warmup = Number(process.env.MAIN_HTTP_BENCH_WARMUP || process.env.ADMIN_HTTP_BENCH_WARMUP || 3);
const limit = Number(process.env.MAIN_HTTP_BENCH_LIMIT || 80);
const cases = (process.env.MAIN_HTTP_BENCH_CASES || 'next,next-seen,blitz,ege13,ege15')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const seenIds = (process.env.MAIN_HTTP_BENCH_SEEN_IDS || '')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);

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

function benchPath(name) {
  const params = new URLSearchParams({
    case: name,
    limit: String(limit),
  });

  if (name === 'next-seen' && seenIds.length > 0) {
    params.set('seen', seenIds.join(','));
  }

  return `/api/bench/main?${params.toString()}`;
}

async function timedFetch(path, cookie) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie },
  });
  const body = await response.json().catch(() => null);
  return {
    status: response.status,
    durationMs: performance.now() - startedAt,
    actionDurationMs: typeof body?.durationMs === 'number' ? body.durationMs : null,
    body,
  };
}

async function measure(name, cookie) {
  const path = benchPath(name);
  for (let index = 0; index < warmup; index += 1) {
    await timedFetch(path, cookie);
  }

  const times = [];
  const actionTimes = [];
  const statuses = new Map();
  let lastBody = null;

  for (let index = 0; index < runs; index += 1) {
    const result = await timedFetch(path, cookie);
    times.push(result.durationMs);
    if (typeof result.actionDurationMs === 'number') {
      actionTimes.push(result.actionDurationMs);
    }
    statuses.set(result.status, (statuses.get(result.status) ?? 0) + 1);
    lastBody = result.body;
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
    actionP95: actionTimes.length > 0
      ? Number(percentile(actionTimes, 95).toFixed(2))
      : null,
    lastBody,
  };
}

const cookie = createAdminSessionCookie();
const results = [];
for (const name of cases) {
  results.push(await measure(name, cookie));
}

console.log(JSON.stringify({
  baseUrl,
  runs,
  warmup,
  limit,
  seenIds: seenIds.length,
  results,
}, null, 2));

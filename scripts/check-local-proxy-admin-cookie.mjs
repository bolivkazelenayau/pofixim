import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import postgres from 'postgres';

const proxyUrl = process.env.ADMIN_PROXY_CHECK_URL || 'http://127.0.0.1:3001';
const externalHost = process.env.ADMIN_PROXY_CHECK_HOST || '100.75.225.52:3001';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

if (!process.env.ADMIN_SESSION_SECRET) {
  throw new Error('ADMIN_SESSION_SECRET is required');
}

function createAdminSessionCookie() {
  const expiresAt = String(Date.now() + 8 * 60 * 60 * 1000);
  const signature = createHmac('sha256', process.env.ADMIN_SESSION_SECRET)
    .update(expiresAt)
    .digest('base64url');
  return `admin_session=${expiresAt}.${signature}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchManual(path, headers = {}) {
  const response = await fetch(`${proxyUrl}${path}`, {
    headers,
    redirect: 'manual',
  });
  return {
    status: response.status,
    location: response.headers.get('location'),
  };
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let proxyProcess = null;

try {
  const [latest] = await sql`
    select id
    from exercises
    order by updated_at desc, id desc
    limit 1
  `;
  if (!latest?.id) throw new Error('No exercises found');

  proxyProcess = spawn('node', ['local-proxy.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PROXY_PORT: '3001',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await wait(500);

  const path = `/admin?exercise=${latest.id}`;
  const cookie = createAdminSessionCookie();
  const unauthenticated = await fetchManual(path, {
    host: externalHost,
    origin: `http://${externalHost}`,
  });
  const authenticated = await fetchManual(path, {
    cookie,
    host: externalHost,
    origin: `http://${externalHost}`,
  });

  console.log(JSON.stringify({
    proxyUrl,
    externalHost,
    sampleId: latest.id,
    unauthenticated,
    authenticated,
  }, null, 2));
} finally {
  if (proxyProcess && !proxyProcess.killed) {
    proxyProcess.kill();
  }
  await sql.end();
}

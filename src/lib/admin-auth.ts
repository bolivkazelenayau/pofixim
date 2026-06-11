import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const ADMIN_SESSION_COOKIE = 'admin_session';
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

function requiredEnv(name: 'ADMIN_PASSWORD' | 'ADMIN_SESSION_SECRET') {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to use the admin panel.`);
  }
  return value;
}

function stringsMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

function signSessionPayload(payload: string) {
  return createHmac('sha256', requiredEnv('ADMIN_SESSION_SECRET'))
    .update(payload)
    .digest('base64url');
}

function createSessionToken() {
  const expiresAt = String(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000);
  return `${expiresAt}.${signSessionPayload(expiresAt)}`;
}

function shouldUseSecureAdminCookie() {
  const override = process.env.ADMIN_COOKIE_SECURE?.trim().toLowerCase();
  if (override === 'false' || override === '0' || override === 'no') return false;
  if (override === 'true' || override === '1' || override === 'yes') return true;
  return process.env.NODE_ENV === 'production';
}

function isValidSessionToken(token: string | undefined) {
  if (!token) return false;
  const [expiresAt, signature, extra] = token.split('.');
  if (!expiresAt || !signature || extra) return false;
  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
  return stringsMatch(signature, signSessionPayload(expiresAt));
}

export function verifyAdminPassword(password: string) {
  return stringsMatch(password, requiredEnv('ADMIN_PASSWORD'));
}

export async function createAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    maxAge: ADMIN_SESSION_TTL_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: shouldUseSecureAdminCookie(),
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: shouldUseSecureAdminCookie(),
  });
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  return isValidSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function requireAdminPageSession() {
  if (!(await isAdminAuthenticated())) {
    redirect('/admin/login');
  }
}

export async function assertAdminAuthorized() {
  if (!(await isAdminAuthenticated())) {
    throw new Error('Unauthorized');
  }
}

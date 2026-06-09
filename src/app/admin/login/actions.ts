'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  clearAdminSession,
  createAdminSession,
  verifyAdminPassword,
} from '@/lib/admin-auth';

const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;

type LoginRateLimitEntry = {
  count: number;
  blockedUntil: number;
  resetAt: number;
};

const loginRateLimitStore = new Map<string, LoginRateLimitEntry>();

function pruneLoginRateLimitStore(now: number) {
  for (const [key, entry] of loginRateLimitStore) {
    if (entry.resetAt <= now && entry.blockedUntil <= now) {
      loginRateLimitStore.delete(key);
    }
  }
}

async function getLoginRateLimitKey() {
  const headerStore = await headers();
  const forwardedFor = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = headerStore.get('x-real-ip')?.trim();
  return forwardedFor || realIp || 'unknown';
}

function isLoginRateLimited(key: string, now: number) {
  const entry = loginRateLimitStore.get(key);
  return Boolean(entry && entry.blockedUntil > now);
}

function recordFailedLoginAttempt(key: string, now: number) {
  const entry = loginRateLimitStore.get(key);
  if (!entry || entry.resetAt <= now) {
    loginRateLimitStore.set(key, {
      count: 1,
      blockedUntil: 0,
      resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS,
    });
    return;
  }

  const nextCount = entry.count + 1;
  loginRateLimitStore.set(key, {
    count: nextCount,
    blockedUntil:
      nextCount >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS
        ? now + LOGIN_RATE_LIMIT_WINDOW_MS
        : entry.blockedUntil,
    resetAt: entry.resetAt,
  });
}

function clearLoginRateLimit(key: string) {
  loginRateLimitStore.delete(key);
}

export async function loginAdminAction(formData: FormData) {
  const now = Date.now();
  pruneLoginRateLimitStore(now);
  const rateLimitKey = await getLoginRateLimitKey();
  if (isLoginRateLimited(rateLimitKey, now)) {
    redirect('/admin/login?error=rate-limit');
  }

  const password = String(formData.get('password') ?? '');
  if (!verifyAdminPassword(password)) {
    recordFailedLoginAttempt(rateLimitKey, now);
    redirect('/admin/login?error=1');
  }

  clearLoginRateLimit(rateLimitKey);
  await createAdminSession();
  redirect('/admin');
}

export async function logoutAdminAction() {
  await clearAdminSession();
  redirect('/admin/login');
}

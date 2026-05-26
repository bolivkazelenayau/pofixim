'use server';

import { redirect } from 'next/navigation';
import {
  clearAdminSession,
  createAdminSession,
  verifyAdminPassword,
} from '@/lib/admin-auth';

export async function loginAdminAction(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  if (!verifyAdminPassword(password)) {
    redirect('/admin/login?error=1');
  }

  await createAdminSession();
  redirect('/admin');
}

export async function logoutAdminAction() {
  await clearAdminSession();
  redirect('/admin/login');
}

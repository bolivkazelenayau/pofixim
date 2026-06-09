'use client';

import dynamic from 'next/dynamic';
import type { AdminFormProps } from '@/components/admin-form/types';

const AdminForm = dynamic(() => import('@/components/AdminForm'), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-[1400px] rounded-2xl border border-stroke bg-surface-strong p-5 text-sm text-foreground/70 shadow-sm">
      Загрузка админки...
    </div>
  ),
});

export default function AdminFormClient(props: AdminFormProps) {
  return <AdminForm {...props} />;
}

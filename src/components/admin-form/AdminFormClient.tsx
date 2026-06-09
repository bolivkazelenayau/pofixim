'use client';

import AdminForm from '@/components/AdminForm';
import type { AdminFormProps } from '@/components/admin-form/types';

export default function AdminFormClient(props: AdminFormProps) {
  return <AdminForm {...props} />;
}

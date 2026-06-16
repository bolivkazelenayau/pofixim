import type { Form } from '@/components/admin-form/types';

export function getFormContentSnapshot(source: Form) {
  const { updatedAt: _updatedAt, ...rest } = source;
  return JSON.stringify(rest);
}

export function persistedSnapshotMatchesForm(persistedSnapshot: string, form: Form) {
  if (!persistedSnapshot) return false;
  const currentSnapshot = JSON.stringify(form);
  if (currentSnapshot === persistedSnapshot) return true;

  try {
    return getFormContentSnapshot(JSON.parse(persistedSnapshot) as Form) === getFormContentSnapshot(form);
  } catch {
    return false;
  }
}

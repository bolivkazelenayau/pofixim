import { inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { updateTag } from 'next/cache';
import { db } from '@/db';
import { exercises } from '@/db/schema';
import { assertAdminAuthorized } from '@/lib/admin-auth';
import type { ExerciseEditorInput } from './admin-types';
import { recordExerciseRevisionBestEffort } from './admin-exercise-revisions';

export async function batchUpdateExercisesMeta(input: {
  ids: number[];
  qualityStatus?: ExerciseEditorInput['qualityStatus'];
  isActive?: boolean;
}) {
  try {
    await assertAdminAuthorized();

    const ids = Array.from(new Set((input.ids ?? []).filter((id) => Number.isInteger(id) && id > 0)));
    if (ids.length === 0) return { success: false, error: 'Нет id для обновления' };
    if (typeof input.qualityStatus === 'undefined' && typeof input.isActive === 'undefined') {
      return { success: false, error: 'Нет полей для обновления' };
    }

    const patch: { qualityStatus?: ExerciseEditorInput['qualityStatus']; isActive?: boolean } = {};
    if (typeof input.qualityStatus !== 'undefined') patch.qualityStatus = input.qualityStatus;
    if (typeof input.isActive !== 'undefined') patch.isActive = input.isActive;
    const batchId = randomUUID();

    const { beforeById, updated } = await db.transaction(async (tx) => {
      const beforeRows = await tx.select().from(exercises).where(inArray(exercises.id, ids));
      const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
      const rows = await tx.update(exercises).set(patch).where(inArray(exercises.id, ids)).returning();
      return { beforeById, updated: rows };
    });
    await Promise.all(
      updated.map((row) =>
        recordExerciseRevisionBestEffort({
          exerciseId: row.id,
          source: 'batch',
          before: beforeById.get(row.id) ?? null,
          after: row,
          batchId,
        }),
      ),
    );
    updateTag('admin:list');
    return { success: true, updated: updated.length };
  } catch (error) {
    console.error('Failed to batch update exercises meta:', error);
    return { success: false, error: 'Unexpected error' };
  }
}

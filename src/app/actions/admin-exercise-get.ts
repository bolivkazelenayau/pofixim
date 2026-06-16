import { eq, getTableColumns, sql } from 'drizzle-orm';
import { db } from '@/db';
import { exercises } from '@/db/schema';
import { assertAdminAuthorized } from '@/lib/admin-auth';
import { mapExerciseRowToEditorResult } from './admin-exercise-mapper';

function isUnauthorizedError(error: unknown) {
  return error instanceof Error && error.message === 'Unauthorized';
}

export async function getExerciseById(id: number) {
  try {
    await assertAdminAuthorized();

    const rows = await db
      .select({
        ...getTableColumns(exercises),
        updatedAt: sql<string>`${exercises.updatedAt}::text`,
      })
      .from(exercises)
      .where(eq(exercises.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return { success: false as const, error: 'Exercise not found' };

    return mapExerciseRowToEditorResult(row);
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return { success: false as const, error: 'Unauthorized' };
    }

    console.error('Failed to get exercise:', error);
    return { success: false as const, error: 'Unexpected error' };
  }
}

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { exercises } from '@/db/schema';
import { assertAdminAuthorized } from '@/lib/admin-auth';
import { mapExerciseRowToEditorResult } from './admin-exercise-mapper';

export async function getExerciseById(id: number) {
  try {
    await assertAdminAuthorized();

    const rows = await db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
    const row = rows[0];
    if (!row) return { success: false as const, error: 'Exercise not found' };

    return mapExerciseRowToEditorResult(row);
  } catch (error) {
    console.error('Failed to get exercise:', error);
    return { success: false as const, error: 'Unexpected error' };
  }
}

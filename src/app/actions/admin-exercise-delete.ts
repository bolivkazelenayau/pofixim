import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { exerciseAttempts, exercises } from '@/db/schema';
import { assertAdminAuthorized } from '@/lib/admin-auth';
import { logSlowServerAction } from '@/lib/slow-action-log';
import { refreshExerciseAdminCaches } from './admin-exercise-save';

export async function deleteExercise(id: number) {
  const startedAt = Date.now();
  try {
    await assertAdminAuthorized();

    if (!Number.isInteger(id) || id <= 0) {
      return { success: false, error: 'Invalid exercise id' };
    }

    const deleted = await db.transaction(async (tx) => {
      await tx.delete(exerciseAttempts).where(eq(exerciseAttempts.exerciseId, id));
      return tx.delete(exercises).where(eq(exercises.id, id)).returning({ id: exercises.id });
    });

    if (deleted.length === 0) {
      return { success: false, error: 'Exercise not found' };
    }

    const existing = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.id, id))
      .limit(1);

    if (existing.length > 0) {
      console.error('Delete verification failed: exercise still exists after delete', { id });
      return { success: false, error: 'Delete verification failed' };
    }

    refreshExerciseAdminCaches();
    return { success: true };
  } catch (error) {
    console.error('Failed to delete exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  } finally {
    logSlowServerAction('deleteExerciseAction', startedAt, { id });
  }
}

import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { exercises } from '@/db/schema';
import { assertAdminAuthorized } from '@/lib/admin-auth';
import type { ExerciseEditorInput } from './admin-types';
import {
  findExerciseIdBySeedKey,
  prepareExerciseSave,
  refreshExerciseAdminCaches,
} from './admin-exercise-save';

export async function createExercise(input: ExerciseEditorInput) {
  try {
    await assertAdminAuthorized();

    const payload = prepareExerciseSave(
      input,
      'seedKey обязателен для создания задания: это защищает от дублей в админке и импортах.',
    );
    if (!payload.success) return payload;

    const existingId = await findExerciseIdBySeedKey(payload.normalizedSeedKey);
    if (existingId) {
      return {
        success: false,
        error: `Задание с seedKey "${payload.normalizedSeedKey}" уже существует (id=${existingId}).`,
      };
    }

    const inserted = await db
      .insert(exercises)
      .values(payload.values)
      .returning({ id: exercises.id });

    refreshExerciseAdminCaches();
    return { success: true, id: inserted[0]?.id };
  } catch (error) {
    console.error('Failed to create exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  }
}

export async function updateExercise(input: ExerciseEditorInput & { id: number }) {
  try {
    await assertAdminAuthorized();

    const payload = prepareExerciseSave(
      input,
      'seedKey обязателен при обновлении задания: это защищает от дублей и потери связи с импортом.',
    );
    if (!payload.success) return payload;

    const existingId = await findExerciseIdBySeedKey(payload.normalizedSeedKey, input.id);
    if (existingId) {
      return {
        success: false,
        error: `Нельзя сохранить: seedKey "${payload.normalizedSeedKey}" уже занят заданием id=${existingId}.`,
      };
    }

    const updated = await db
      .update(exercises)
      .set({
        ...payload.values,
        updatedAt: sql`now()::timestamp`,
      })
      .where(eq(exercises.id, input.id))
      .returning({ id: exercises.id });

    if (updated.length === 0) {
      return { success: false, error: 'Exercise not found' };
    }

    refreshExerciseAdminCaches();
    return { success: true };
  } catch (error) {
    console.error('Failed to update exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  }
}

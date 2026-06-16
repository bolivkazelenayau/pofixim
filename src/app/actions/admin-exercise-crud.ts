import { and, eq, sql } from 'drizzle-orm';
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
      .where(
        input.knownUpdatedAt
          ? and(
              eq(exercises.id, input.id),
              sql`${exercises.updatedAt} = ${input.knownUpdatedAt}::timestamp`,
            )
          : eq(exercises.id, input.id),
      )
      .returning({
        id: exercises.id,
        updatedAt: sql<string>`${exercises.updatedAt}::text`,
      });

    if (updated.length === 0) {
      if (input.knownUpdatedAt) {
        const current = await db
          .select({
            id: exercises.id,
            updatedAt: sql<string>`${exercises.updatedAt}::text`,
          })
          .from(exercises)
          .where(eq(exercises.id, input.id))
          .limit(1);

        if (current.length > 0) {
          return {
            success: false,
            code: 'STALE_EXERCISE_VERSION',
            error:
              'Задание уже изменилось в БД. Локальная версия сохранена как черновик: обновите запись из базы или сравните изменения перед повторным сохранением.',
            currentUpdatedAt: current[0]?.updatedAt ?? null,
          };
        }
      }

      return { success: false, error: 'Exercise not found' };
    }

    refreshExerciseAdminCaches();
    return { success: true, updatedAt: updated[0]?.updatedAt ?? null };
  } catch (error) {
    console.error('Failed to update exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  }
}

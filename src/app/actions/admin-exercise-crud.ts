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
import { recordExerciseRevisionBestEffort } from './admin-exercise-revisions';

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

    const inserted = await db.insert(exercises).values(payload.values).returning();
    const insertedRow = inserted[0];
    if (insertedRow) {
      await recordExerciseRevisionBestEffort({
        exerciseId: insertedRow.id,
        source: 'create',
        after: insertedRow,
      });
    }

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

    const { before, updated } = await db.transaction(async (tx) => {
      const beforeRows = await tx.select().from(exercises).where(eq(exercises.id, input.id)).limit(1);
      const before = beforeRows[0] ?? null;
      const rows = await tx
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
          seedKey: exercises.seedKey,
          type: exercises.type,
          category: exercises.category,
          difficulty: exercises.difficulty,
          skillTags: exercises.skillTags,
          prompt: exercises.prompt,
          payload: exercises.payload,
          answer: exercises.answer,
          explanation: exercises.explanation,
          searchBlob: exercises.searchBlob,
          searchBlobNormalized: exercises.searchBlobNormalized,
          sourceAlignment: exercises.sourceAlignment,
          typicalMistake: exercises.typicalMistake,
          mistakeModel: exercises.mistakeModel,
          algorithmSteps: exercises.algorithmSteps,
          transferGroup: exercises.transferGroup,
          qualityStatus: exercises.qualityStatus,
          visualHint: exercises.visualHint,
          isActive: exercises.isActive,
          createdAt: exercises.createdAt,
          updatedAt: exercises.updatedAt,
          updatedAtText: sql<string>`${exercises.updatedAt}::text`,
        });
      return { before, updated: rows };
    });

    const updatedRow = updated[0];
    if (updatedRow) {
      await recordExerciseRevisionBestEffort({
        exerciseId: updatedRow.id,
        source: 'manual',
        before,
        after: updatedRow,
      });
    }

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
          if (process.env.NODE_ENV !== 'production') {
            console.info('[admin-debug] updateExercise:stale', {
              id: input.id,
              seedKey: payload.normalizedSeedKey,
              knownUpdatedAt: input.knownUpdatedAt,
              currentUpdatedAt: current[0]?.updatedAt ?? null,
              promptLength: input.prompt.length,
              explanationLength: input.explanation.length,
            });
          }

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
    return {
      success: true,
      updatedAt: updated[0]?.updatedAtText ?? null,
    };
  } catch (error) {
    console.error('Failed to update exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  }
}

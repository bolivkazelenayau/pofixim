import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath, updateTag } from 'next/cache';
import { db } from '@/db';
import { exercises } from '@/db/schema';
import { exerciseSchema } from '@/features/exercises/schemas';
import type { ExerciseEditorInput } from './admin-types';
import { buildExercisePayload } from './admin-payload-builders';
import { validateExerciseEditorInput } from './admin-exercise-validation';
import {
  buildAdminSearchBlob,
  buildAdminSearchBlobNormalized,
} from './admin-search-blob';

type ExerciseSchemaParseResult = ReturnType<typeof exerciseSchema.safeParse>;

function buildValidationError(parsed: ExerciseSchemaParseResult) {
  if (parsed.success) {
    return null;
  }

  const issue = parsed.error.issues[0];
  const path = issue?.path?.length ? issue.path.join('.') : 'unknown';
  return issue ? `${path}: ${issue.message}` : 'Validation failed';
}

function buildExerciseValues(
  input: ExerciseEditorInput,
  normalizedSeedKey: string,
) {
  const parsed = exerciseSchema.safeParse(
    buildExercisePayload({
      ...input,
      seedKey: normalizedSeedKey,
    }),
  );
  const validationError = buildValidationError(parsed);

  if (validationError || !parsed.success) {
    return { success: false as const, error: validationError ?? 'Validation failed' };
  }

  const exercise = parsed.data;
  const searchInput = {
    seedKey: normalizedSeedKey,
    prompt: exercise.prompt,
    explanation: exercise.explanation,
    payload: exercise.payload,
    answer: exercise.answer,
  };
  return {
    success: true as const,
    values: {
      seedKey: normalizedSeedKey,
      type: exercise.type,
      category: exercise.category,
      difficulty: exercise.difficulty,
      skillTags: exercise.skillTags,
      prompt: exercise.prompt,
      payload: exercise.payload,
      answer: exercise.answer,
      explanation: exercise.explanation,
      searchBlob: buildAdminSearchBlob(searchInput),
      searchBlobNormalized: buildAdminSearchBlobNormalized(searchInput),
      sourceAlignment: exercise.sourceAlignment ?? null,
      typicalMistake: exercise.typicalMistake ?? null,
      algorithmSteps: exercise.algorithmSteps ?? null,
      qualityStatus: exercise.qualityStatus,
      isActive: exercise.isActive,
    },
  };
}

export function prepareExerciseSave(input: ExerciseEditorInput, emptySeedKeyError: string) {
  const normalizedSeedKey = input.seedKey?.trim() ?? '';
  if (!normalizedSeedKey) {
    return { success: false as const, error: emptySeedKeyError };
  }

  const editorValidationError = validateExerciseEditorInput(input);
  if (editorValidationError) {
    return { success: false as const, error: editorValidationError };
  }

  const payload = buildExerciseValues(input, normalizedSeedKey);
  if (!payload.success) {
    return payload;
  }

  return {
    success: true as const,
    normalizedSeedKey,
    values: payload.values,
  };
}

export async function findExerciseIdBySeedKey(
  normalizedSeedKey: string,
  excludeId?: number,
) {
  const whereExpr =
    typeof excludeId === 'number'
      ? and(eq(exercises.seedKey, normalizedSeedKey), ne(exercises.id, excludeId))
      : eq(exercises.seedKey, normalizedSeedKey);

  const rows = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(whereExpr)
    .limit(1);

  return rows[0]?.id ?? null;
}

export function refreshExerciseAdminCaches() {
  updateTag('admin:list');
  revalidatePath('/');
}

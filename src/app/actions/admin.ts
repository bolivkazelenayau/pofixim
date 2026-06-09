'use server';

import { and, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { revalidatePath, updateTag } from 'next/cache';
import { db } from '@/db';
import { exerciseAttempts, exercises } from '@/db/schema';
import { exerciseSchema } from '@/features/exercises/schemas';
import { assertAdminAuthorized } from '@/lib/admin-auth';
import { stripEge18PromptFromFillBefore } from '@/lib/exercise-type-conversion';
import { logSlowServerAction } from '@/lib/slow-action-log';
import type { ExerciseEditorInput, PunctuationConstructorMark } from './admin-types';
import { buildExercisePayload } from './admin-payload-builders';

type ExerciseListItem = {
  id: number;
  type: string;
  skillTags: string[];
  seedKey: string | null;
  prompt: string;
  explanation: string;
  searchText?: string;
  qualityStatus: string;
  updatedAt: string;
  updatedAtCursor: string;
  isActive: boolean;
};

function isLetterChar(value: string) {
  return /^\p{L}$/u.test(value);
}

function normalizeValidationText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateFillBlankBoundaries(input: ExerciseEditorInput): string | null {
  if (input.type !== 'fill_blank') {
    return null;
  }

  const before = (input.fillBefore ?? '').trimEnd();
  const after = (input.fillAfter ?? '').trimStart();
  const prompt = normalizeValidationText(input.prompt ?? '');
  const lastBefore = before.slice(-1);
  const firstAfter = after.slice(0, 1);
  const accepted = (input.fillAccepted ?? []).map((value) => value.trim()).filter(Boolean);
  const hasLetterAcceptedAnswer = accepted.some((value) => /\p{L}/u.test(value));
  const looksLikeNumberSignature = accepted.length > 0 && accepted.every((value) => /^\d[\d,\s.]*$/u.test(value));
  const looksLikeMultiSelectPrompt =
    prompt.includes('укажите варианты ответов') &&
    prompt.includes('запишите номера ответов');

  if (!lastBefore || !firstAfter) {
    if (!after && looksLikeMultiSelectPrompt && looksLikeNumberSignature) {
      return 'Этот fill_blank выглядит как задание с выбором номеров: текст после пропуска пустой, а допустимый ответ похож на "124". Для такого задания используйте ege_multi_select.';
    }
    return null;
  }

  // Legitimate fill_blank tasks often place the blank inside a word
  // (e.g. "вид" + "__" + "мый"). We only block word-internal splits when
  // the accepted answers do not look like letter fragments, which is a
  // strong signal of a broken cross-type conversion.
  if (hasLetterAcceptedAnswer) {
    return null;
  }

  if (isLetterChar(lastBefore) && isLetterChar(firstAfter)) {
    return 'Нельзя разрезать слово границей пропуска: заполните поля "Текст до пропуска" и "Текст после пропуска" по границе слова.';
  }

  return null;
}

function validateTypeSkillConsistency(input: ExerciseEditorInput): string | null {
  const tags = new Set((input.skillTags ?? []).map((t) => t.trim()).filter(Boolean));
  const prompt = (input.prompt ?? '').toLowerCase();
  const looksLikeEgeMultiSelect =
    prompt.includes('укажите варианты ответов') &&
    prompt.includes('запишите номера ответов');

  if (tags.has('ege.9') && looksLikeEgeMultiSelect && input.type !== 'ege_multi_select') {
    return 'Для формулировки ЕГЭ-9 с выбором номеров тип должен быть ege_multi_select, а не fill_blank.';
  }

  return null;
}

function validateAnswerCompleteness(input: ExerciseEditorInput): string | null {
  if (input.type === 'ege_multi_select') {
    const options = (input.options ?? []).map((value) => value.trim()).filter(Boolean);
    const targetSet = (input.multiCorrectOptionIndexes ?? [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (options.length < 2) {
      return 'Для ege_multi_select нужно заполнить как минимум два варианта ответа.';
    }

    if (targetSet.length === 0) {
      return 'Для ege_multi_select нужно указать правильные номера ответа.';
    }
  }

  if (input.type === 'fill_blank') {
    const accepted = (input.fillAccepted ?? []).map((value) => value.trim()).filter(Boolean);
    if (accepted.length === 0) {
      return 'Для fill_blank нужно указать допустимые ответы.';
    }
  }

  if (input.type === 'dictation') {
    if (!(input.dictationAudioSrc ?? '').trim()) {
      return 'Для dictation нужно указать путь к аудио.';
    }
    if (!(input.dictationText ?? '').trim()) {
      return 'Для dictation нужно указать эталонную расшифровку.';
    }
  }

  return null;
}

export async function createExerciseAction(input: ExerciseEditorInput) {
  try {
    await assertAdminAuthorized();

    const normalizedSeedKey = input.seedKey?.trim() ?? '';
    if (!normalizedSeedKey) {
      return {
        success: false,
        error:
          'seedKey обязателен для создания задания: это защищает от дублей в админке и импортах.',
      };
    }

    const fillBlankBoundaryError = validateFillBlankBoundaries(input);
    if (fillBlankBoundaryError) {
      return { success: false, error: fillBlankBoundaryError };
    }
    const typeSkillError = validateTypeSkillConsistency(input);
    if (typeSkillError) {
      return { success: false, error: typeSkillError };
    }
    const answerCompletenessError = validateAnswerCompleteness(input);
    if (answerCompletenessError) {
      return { success: false, error: answerCompletenessError };
    }

    const parsed = exerciseSchema.safeParse(
      buildExercisePayload({
        ...input,
        seedKey: normalizedSeedKey,
      }),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path?.length ? issue.path.join('.') : 'unknown';
      return {
        success: false,
        error: issue ? `${path}: ${issue.message}` : 'Validation failed',
      };
    }

    const exercise = parsed.data;
    const existingBySeedKey = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.seedKey, normalizedSeedKey))
      .limit(1);

    if (existingBySeedKey[0]) {
      return {
        success: false,
        error: `Задание с seedKey "${normalizedSeedKey}" уже существует (id=${existingBySeedKey[0].id}).`,
      };
    }

    const inserted = await db
      .insert(exercises)
      .values({
        seedKey: normalizedSeedKey,
        type: exercise.type,
        category: exercise.category,
        difficulty: exercise.difficulty,
        skillTags: exercise.skillTags,
        prompt: exercise.prompt,
        payload: exercise.payload,
        answer: exercise.answer,
        explanation: exercise.explanation,
        sourceAlignment: exercise.sourceAlignment ?? null,
        typicalMistake: exercise.typicalMistake ?? null,
        algorithmSteps: exercise.algorithmSteps ?? null,
        qualityStatus: exercise.qualityStatus,
        isActive: exercise.isActive,
      })
      .returning({ id: exercises.id });

    updateTag('admin:list');
    revalidatePath('/');
    return { success: true, id: inserted[0]?.id };
  } catch (error) {
    console.error('Failed to create exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  }
}

export async function updateExerciseAction(input: ExerciseEditorInput & { id: number }) {
  try {
    await assertAdminAuthorized();

    const normalizedSeedKey = input.seedKey?.trim() ?? '';
    if (!normalizedSeedKey) {
      return {
        success: false,
        error:
          'seedKey обязателен при обновлении задания: это защищает от дублей и потери связи с импортом.',
      };
    }

    const fillBlankBoundaryError = validateFillBlankBoundaries(input);
    if (fillBlankBoundaryError) {
      return { success: false, error: fillBlankBoundaryError };
    }
    const typeSkillError = validateTypeSkillConsistency(input);
    if (typeSkillError) {
      return { success: false, error: typeSkillError };
    }
    const answerCompletenessError = validateAnswerCompleteness(input);
    if (answerCompletenessError) {
      return { success: false, error: answerCompletenessError };
    }

    const parsed = exerciseSchema.safeParse(
      buildExercisePayload({
        ...input,
        seedKey: normalizedSeedKey,
      }),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path?.length ? issue.path.join('.') : 'unknown';
      return {
        success: false,
        error: issue ? `${path}: ${issue.message}` : 'Validation failed',
      };
    }

    const exercise = parsed.data;
    const existingBySeedKey = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.seedKey, normalizedSeedKey), ne(exercises.id, input.id)))
      .limit(1);

    if (existingBySeedKey[0]) {
      return {
        success: false,
        error: `Нельзя сохранить: seedKey "${normalizedSeedKey}" уже занят заданием id=${existingBySeedKey[0].id}.`,
      };
    }

    const updated = await db
      .update(exercises)
      .set({
        seedKey: normalizedSeedKey,
        type: exercise.type,
        category: exercise.category,
        difficulty: exercise.difficulty,
        skillTags: exercise.skillTags,
        prompt: exercise.prompt,
        payload: exercise.payload,
        answer: exercise.answer,
        explanation: exercise.explanation,
        sourceAlignment: exercise.sourceAlignment ?? null,
        typicalMistake: exercise.typicalMistake ?? null,
        algorithmSteps: exercise.algorithmSteps ?? null,
        qualityStatus: exercise.qualityStatus,
        isActive: exercise.isActive,
        updatedAt: sql`now()::timestamp`,
      })
      .where(eq(exercises.id, input.id))
      .returning({ id: exercises.id });

    if (updated.length === 0) {
      return { success: false, error: 'Exercise not found' };
    }

    updateTag('admin:list');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to update exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  }
}

export async function deleteExerciseAction(id: number) {
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

    updateTag('admin:list');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  } finally {
    logSlowServerAction('deleteExerciseAction', startedAt, { id });
  }
}

export async function batchUpdateExercisesMetaAction(input: {
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

    await db.update(exercises).set(patch).where(inArray(exercises.id, ids));
    updateTag('admin:list');
    return { success: true, updated: ids.length };
  } catch (error) {
    console.error('Failed to batch update exercises meta:', error);
    return { success: false, error: 'Unexpected error' };
  }
}

type ListExercisesParams = {
  limit?: number;
  offset?: number;
  cursorId?: number;
  cursorUpdatedAt?: string;
  query?: string;
  type?: string;
  qualityStatus?: string;
  examType?: string;
  sortBy?: 'id' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
  includeTotal?: boolean;
};

function normalizeSearchQuery(input: string) {
  return input
    .toLowerCase()
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSearchBlobQuery(input: string) {
  return input
    .toLowerCase()
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDigitsOnlySearchQuery(input: string) {
  return /^\d+$/u.test(input);
}

function isSeedKeyLikeSearchQuery(input: string) {
  return /^[a-z0-9:_-]+$/iu.test(input) && /[a-z:_-]/iu.test(input);
}

function shouldUseNormalizedBlobSearch(input: string) {
  return /[*_~[\]()<>{}|\\]/u.test(input) || /\s{2,}/u.test(input);
}

async function fetchExerciseListRows(input: {
  whereExpr: ReturnType<typeof and>;
  sortBy: 'id' | 'updatedAt';
  sortDir: 'asc' | 'desc';
  normalizedLimit: number;
  normalizedOffset: number;
  useOffset: boolean;
}) {
  const { whereExpr, sortBy, sortDir, normalizedLimit, normalizedOffset, useOffset } = input;

  return db
    .select({
      id: exercises.id,
      type: exercises.type,
      skillTags: exercises.skillTags,
      seedKey: exercises.seedKey,
      prompt: exercises.prompt,
      explanation: exercises.explanation,
      searchText: sql<string>`(${exercises.payload}::text || ' ' || ${exercises.answer}::text)`,
      qualityStatus: exercises.qualityStatus,
      updatedAt: sql<string>`${exercises.updatedAt}::text`,
      updatedAtCursor: sql<string>`${exercises.updatedAt}::text`,
      isActive: exercises.isActive,
    })
    .from(exercises)
    .where(whereExpr)
    .orderBy(
      sortBy === 'updatedAt'
        ? (sortDir === 'desc' ? desc(exercises.updatedAt) : sql`${exercises.updatedAt} asc`)
        : (sortDir === 'desc' ? desc(exercises.id) : sql`${exercises.id} asc`),
      sortDir === 'desc' ? desc(exercises.id) : sql`${exercises.id} asc`,
    )
    .limit(normalizedLimit + 1)
    .offset(useOffset ? normalizedOffset : 0);
}

type ExerciseListRow = Awaited<ReturnType<typeof fetchExerciseListRows>>[number];

function compareExerciseListRows(
  left: ExerciseListRow,
  right: ExerciseListRow,
  sortBy: 'id' | 'updatedAt',
  sortDir: 'asc' | 'desc',
) {
  if (sortBy === 'updatedAt') {
    if (left.updatedAtCursor !== right.updatedAtCursor) {
      return sortDir === 'desc'
        ? right.updatedAtCursor.localeCompare(left.updatedAtCursor)
        : left.updatedAtCursor.localeCompare(right.updatedAtCursor);
    }
  }

  return sortDir === 'desc' ? right.id - left.id : left.id - right.id;
}

function mergeExerciseListRows(
  rows: ExerciseListRow[],
  sortBy: 'id' | 'updatedAt',
  sortDir: 'asc' | 'desc',
) {
  const deduped = new Map<number, ExerciseListRow>();
  for (const row of rows) {
    if (!deduped.has(row.id)) {
      deduped.set(row.id, row);
    }
  }

  return Array.from(deduped.values()).sort((left, right) =>
    compareExerciseListRows(left, right, sortBy, sortDir),
  );
}

function buildUpdatedAtCursorCondition(input: {
  cursorId: number;
  cursorUpdatedAt: string;
  sortDir: 'asc' | 'desc';
}) {
  const { cursorId, cursorUpdatedAt, sortDir } = input;

  if (sortDir === 'desc') {
    return sql`(${exercises.updatedAt} < ${cursorUpdatedAt}::text::timestamp or (${exercises.updatedAt} = ${cursorUpdatedAt}::text::timestamp and ${exercises.id} < ${cursorId}))`;
  }

  return sql`(${exercises.updatedAt} > ${cursorUpdatedAt}::text::timestamp or (${exercises.updatedAt} = ${cursorUpdatedAt}::text::timestamp and ${exercises.id} > ${cursorId}))`;
}

export async function getExerciseTypeOptionsAction() {
  try {
    await assertAdminAuthorized();

    const rows = await db.execute(
      sql`select unnest(enum_range(NULL::exercise_type))::text as type`,
    );
    const items = rows
      .map((row) => String((row as { type?: unknown }).type ?? '').trim())
      .filter((v) => v.length > 0);

    return { success: true, items };
  } catch (error) {
    console.error('Failed to fetch exercise type options:', error);
    return { success: false, items: [] as string[] };
  }
}

export async function listExercisesAction(params: ListExercisesParams = {}) {
  const startedAt = Date.now();
  try {
    await assertAdminAuthorized();
    const normalizedLimit = Math.max(1, Math.min(params.limit ?? 100, 500));
    const normalizedOffset = Math.max(0, params.offset ?? 0);
    const cursorId = Number(params.cursorId ?? NaN);
    const cursorUpdatedAt = (params.cursorUpdatedAt ?? '').trim();
    const query = (params.query ?? '').trim();
    const normalizedQuery = normalizeSearchQuery(query);
    const blobQuery = normalizeSearchBlobQuery(query);
    const type = (params.type ?? 'all').trim();
    const qualityStatus = (params.qualityStatus ?? 'all').trim();
    const examType = (params.examType ?? 'all').trim();
    const sortBy = params.sortBy === 'updatedAt' ? 'updatedAt' : 'id';
    const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';
    const includeTotal = Boolean(params.includeTotal);
    const hasCursor = Number.isInteger(cursorId) && cursorId > 0;

    const baseWhereParts = [sql`${exercises.id} is not null`];
    if (type !== 'all') baseWhereParts.push(eq(exercises.type, type as typeof exercises.type._.data));
    if (qualityStatus !== 'all') baseWhereParts.push(eq(exercises.qualityStatus, qualityStatus));
    if (examType !== 'all') {
      baseWhereParts.push(
        sql`${exercises.skillTags} @> array[${`ege.${examType}`}]::text[]`,
      );
    }

    const buildListResult = (rows: Awaited<ReturnType<typeof fetchExerciseListRows>>) => {
      const hasMore = rows.length > normalizedLimit;
      const pageRows = hasMore ? rows.slice(0, normalizedLimit) : rows;
      const items: ExerciseListItem[] = pageRows.map((row) => ({
        id: row.id,
        type: row.type,
        skillTags: row.skillTags,
        seedKey: row.seedKey,
        prompt: row.prompt,
        explanation: row.explanation,
        searchText: row.searchText,
        qualityStatus: row.qualityStatus,
        updatedAt: row.updatedAt,
        updatedAtCursor: row.updatedAtCursor,
        isActive: row.isActive,
      }));
      const last = pageRows[pageRows.length - 1];
      const estimatedTotal = normalizedOffset + pageRows.length + (hasMore ? 1 : 0);

      return {
        success: true,
        items,
        total: estimatedTotal,
        hasMore,
        nextOffset: normalizedOffset + items.length,
        nextCursorId: last ? last.id : null,
        nextCursorUpdatedAt: last ? last.updatedAtCursor : null,
      };
    };

    if (query && !includeTotal && !hasCursor) {
      const pattern = `%${query.toLowerCase()}%`;
      const fastQueryIsEligible =
        isDigitsOnlySearchQuery(query) || isSeedKeyLikeSearchQuery(query);
      const useNormalizedBlobSearch = shouldUseNormalizedBlobSearch(query);

      const fastRows = fastQueryIsEligible
        ? await fetchExerciseListRows({
            whereExpr: and(
              ...baseWhereParts,
              sql`(
                cast(${exercises.id} as text) ilike ${pattern}
                or lower(coalesce(${exercises.seedKey}, '')) like ${pattern}
              )`,
            ),
            sortBy,
            sortDir,
            normalizedLimit,
            normalizedOffset,
            useOffset: true,
          })
        : [];

      if (fastRows.length > normalizedLimit) {
        return buildListResult(fastRows);
      }

      const blobRows = await fetchExerciseListRows({
        whereExpr: and(
          ...baseWhereParts,
          sql`lower(
                replace(
                  coalesce(${exercises.seedKey}, '') || ' ' || coalesce(${exercises.prompt}, '') || ' ' || coalesce(${exercises.explanation}, '') || ' ' || ${exercises.payload}::text || ' ' || ${exercises.answer}::text,
                  chr(173),
                  ''
                )
              ) like ${`%${blobQuery}%`}`,
        ),
        sortBy,
        sortDir,
        normalizedLimit,
        normalizedOffset,
        useOffset: true,
      });

      const normalizedRows = useNormalizedBlobSearch
        ? await fetchExerciseListRows({
            whereExpr: and(
              ...baseWhereParts,
              sql`lower(
                    regexp_replace(
                      regexp_replace(
                        replace(
                          coalesce(${exercises.seedKey}, '') || ' ' || coalesce(${exercises.prompt}, '') || ' ' || coalesce(${exercises.explanation}, '') || ' ' || ${exercises.payload}::text || ' ' || ${exercises.answer}::text,
                          chr(173),
                          ''
                        ),
                        '[*_~\\[\\]()<>{}|\\\\]',
                        '',
                        'g'
                      ),
                      '\\s+',
                      ' ',
                      'g'
                    )
                  ) like ${`%${normalizedQuery}%`}`,
            ),
            sortBy,
            sortDir,
            normalizedLimit,
            normalizedOffset,
            useOffset: true,
          })
        : [];

      const mergedRows = mergeExerciseListRows(
        [...fastRows, ...blobRows, ...normalizedRows],
        sortBy,
        sortDir,
      );
      return buildListResult(mergedRows);
    }

    const whereParts = [...baseWhereParts];
    if (query) {
      const pattern = `%${query.toLowerCase()}%`;
      const normalizedPattern = `%${normalizedQuery}%`;
      const blobPattern = `%${blobQuery}%`;
      if (shouldUseNormalizedBlobSearch(query)) {
        whereParts.push(
          sql`(
            cast(${exercises.id} as text) ilike ${pattern}
            or lower(coalesce(${exercises.seedKey}, '')) like ${pattern}
            or lower(
              replace(
                coalesce(${exercises.seedKey}, '') || ' ' || coalesce(${exercises.prompt}, '') || ' ' || coalesce(${exercises.explanation}, '') || ' ' || ${exercises.payload}::text || ' ' || ${exercises.answer}::text,
                chr(173),
                ''
              )
            ) like ${blobPattern}
            or lower(
              regexp_replace(
                regexp_replace(
                  replace(
                    coalesce(${exercises.seedKey}, '') || ' ' || coalesce(${exercises.prompt}, '') || ' ' || coalesce(${exercises.explanation}, '') || ' ' || ${exercises.payload}::text || ' ' || ${exercises.answer}::text,
                    chr(173),
                    ''
                  ),
                  '[*_~\\[\\]()<>{}|\\\\]',
                  '',
                  'g'
                ),
                '\\s+',
                ' ',
                'g'
              )
            ) like ${normalizedPattern}
          )`,
        );
      } else {
        whereParts.push(
          sql`(
            cast(${exercises.id} as text) ilike ${pattern}
            or lower(coalesce(${exercises.seedKey}, '')) like ${pattern}
            or lower(
              replace(
                coalesce(${exercises.seedKey}, '') || ' ' || coalesce(${exercises.prompt}, '') || ' ' || coalesce(${exercises.explanation}, '') || ' ' || ${exercises.payload}::text || ' ' || ${exercises.answer}::text,
                chr(173),
                ''
              )
            ) like ${blobPattern}
          )`,
        );
      }
    }
    if (sortBy === 'id' && hasCursor) {
      if (sortDir === 'desc') whereParts.push(lt(exercises.id, cursorId));
      else whereParts.push(sql`${exercises.id} > ${cursorId}`);
    }
    if (sortBy === 'updatedAt' && hasCursor && cursorUpdatedAt) {
      // Keep PostgreSQL's full timestamp precision; Date/ISO conversion truncates microseconds.
      whereParts.push(buildUpdatedAtCursorCondition({ cursorId, cursorUpdatedAt, sortDir }));
    }

    const whereExpr = and(...whereParts);

    const rows = await fetchExerciseListRows({
      whereExpr,
      sortBy,
      sortDir,
      normalizedLimit,
      normalizedOffset,
      useOffset: !hasCursor,
    });

    const hasMore = rows.length > normalizedLimit;
    const pageRows = hasMore ? rows.slice(0, normalizedLimit) : rows;
    let total = normalizedOffset + pageRows.length + (hasMore ? 1 : 0);
    if (includeTotal) {
      const totalRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(exercises)
        .where(whereExpr);
      total = Number(totalRows[0]?.count ?? total);
    }
    const items: ExerciseListItem[] = pageRows.map((row) => ({
      id: row.id,
      type: row.type,
      skillTags: row.skillTags,
      seedKey: row.seedKey,
      prompt: row.prompt,
      explanation: row.explanation,
      searchText: row.searchText,
      qualityStatus: row.qualityStatus,
      updatedAt: row.updatedAt,
      updatedAtCursor: row.updatedAtCursor,
      isActive: row.isActive,
    }));
    const last = pageRows[pageRows.length - 1];

    return {
      success: true,
      items,
      total,
      hasMore,
      nextOffset: normalizedOffset + items.length,
      nextCursorId: last ? last.id : null,
      nextCursorUpdatedAt: last ? last.updatedAtCursor : null,
    };
  } catch (error) {
    console.error('Failed to list exercises:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
      items: [] as ExerciseListItem[],
      total: 0,
      hasMore: false,
      nextOffset: 0,
      nextCursorId: null as number | null,
      nextCursorUpdatedAt: null as string | null,
    };
  } finally {
    logSlowServerAction('listExercisesAction', startedAt, {
      sortBy: params.sortBy === 'updatedAt' ? 'updatedAt' : 'id',
      sortDir: params.sortDir === 'asc' ? 'asc' : 'desc',
      hasQuery: Boolean((params.query ?? '').trim()),
      type: (params.type ?? 'all').trim(),
      qualityStatus: (params.qualityStatus ?? 'all').trim(),
      examType: (params.examType ?? 'all').trim(),
      limit: Math.max(1, Math.min(params.limit ?? 100, 500)),
      includeTotal: Boolean(params.includeTotal),
    });
  }
}

export async function getExerciseByIdAction(id: number) {
  try {
    await assertAdminAuthorized();

    const rows = await db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
    const row = rows[0];
    if (!row) return { success: false, error: 'Exercise not found' };

    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const answer = (row.answer ?? {}) as Record<string, unknown>;
    const sourceAlignment = (row.sourceAlignment ?? {}) as Record<string, unknown>;
    const algorithmSteps = Array.isArray(row.algorithmSteps) ? row.algorithmSteps : [];

    const base = {
      id: row.id,
      type: row.type,
      seedKey: row.seedKey ?? '',
      category: row.category,
      difficulty: row.difficulty as 1 | 2,
      qualityStatus: row.qualityStatus as ExerciseEditorInput['qualityStatus'],
      prompt: row.prompt,
      explanation: row.explanation,
      skillTags: row.skillTags,
      sourceAlignment: typeof sourceAlignment.reference === 'string' ? sourceAlignment.reference : '',
      typicalMistake: row.typicalMistake ?? '',
      algorithmSteps: algorithmSteps
        .map((s) => (typeof (s as Record<string, unknown>).title === 'string' ? (s as Record<string, unknown>).title as string : ''))
        .filter(Boolean),
      isActive: row.isActive,
    };

    if (row.type === 'multiple_choice') {
      return {
        success: true,
        item: {
          ...base,
          options: Array.isArray(payload.options) ? payload.options.filter((v): v is string => typeof v === 'string') : [],
          correctOptionIndex: typeof answer.correctOptionIndex === 'number' ? answer.correctOptionIndex : 0,
        },
      };
    }

    if (row.type === 'ege_multi_select') {
      return {
        success: true,
        item: {
          ...base,
          options: Array.isArray(payload.options) ? payload.options.filter((v): v is string => typeof v === 'string') : [],
          multiCorrectOptionIndexes: Array.isArray(answer.targetSet)
            ? answer.targetSet.filter((v): v is number => typeof v === 'number')
            : [],
        },
      };
    }

    if (row.type === 'fill_blank') {
      const isEge18 = row.skillTags.includes('ege.18');
      const fillBefore = typeof payload.before === 'string' ? payload.before : '';
      return {
        success: true,
        item: {
          ...base,
          fillBefore: isEge18
            ? stripEge18PromptFromFillBefore(fillBefore, row.prompt)
            : fillBefore,
          fillAfter: typeof payload.after === 'string' ? payload.after : '',
          fillAccepted: Array.isArray(answer.accepted) ? answer.accepted.filter((v): v is string => typeof v === 'string') : [],
          fillCaseSensitive: Boolean(answer.caseSensitive),
        },
      };
    }

    if (row.type === 'word_bank_cloze') {
      return {
        success: true,
        item: {
          ...base,
          wordBankTextWithSlots:
            typeof payload.textWithSlots === 'string' ? payload.textWithSlots : '',
          wordBankWords: Array.isArray(payload.wordBank)
            ? payload.wordBank.filter((v): v is string => typeof v === 'string')
            : [],
          wordBankCorrectBySlot: Array.isArray(answer.correctBySlot)
            ? answer.correctBySlot.filter((v): v is string => typeof v === 'string')
            : [],
          wordBankCaseSensitive: Boolean(answer.caseSensitive),
        },
      };
    }

    if (row.type === 'word_search') {
      return {
        success: true,
        item: {
          ...base,
          wordSearchGridRows: Array.isArray(payload.grid)
            ? (payload.grid as unknown[])
                .map((row) =>
                  Array.isArray(row)
                    ? row
                        .map((cell) => (typeof cell === 'string' ? cell : ''))
                        .join('')
                    : '',
                )
                .filter(Boolean)
            : [],
          wordSearchWords: Array.isArray(answer.words)
            ? answer.words.filter((v): v is string => typeof v === 'string')
            : [],
          wordSearchCaseSensitive: Boolean(answer.caseSensitive),
        },
      };
    }

    if (row.type === 'orthography_repair') {
      return {
        success: true,
        item: {
          ...base,
          orthographyRepairText:
            typeof payload.text === 'string' ? payload.text : '',
          orthographyRepairMode:
            payload.mode === 'click_then_type' ? 'click_then_type' : 'click_then_choose',
          orthographyRepairTargets: Array.isArray(payload.targets)
            ? payload.targets
                .map((target) => (target ?? {}) as Record<string, unknown>)
                .filter(
                  (target) =>
                    typeof target.id === 'string' &&
                    typeof target.surface === 'string' &&
                    typeof target.replacement === 'string' &&
                    typeof target.type === 'string',
                )
                .map((target) => ({
                  id: String(target.id),
                  surface: String(target.surface),
                  replacement: String(target.replacement),
                  type: target.type === 'span' ? 'span' as const : 'word' as const,
                  options: Array.isArray(target.options)
                    ? target.options.filter((v): v is string => typeof v === 'string')
                    : undefined,
                  occurrence:
                    typeof target.occurrence === 'number'
                      ? Number(target.occurrence)
                      : undefined,
                }))
            : [],
          orthographyRepairHints: Array.isArray(payload.hints)
            ? payload.hints.filter((v): v is string => typeof v === 'string')
            : [],
          orthographyRepairRepairs: Array.isArray(answer.repairs)
            ? answer.repairs
                .map((repair) => (repair ?? {}) as Record<string, unknown>)
                .filter(
                  (repair) =>
                    typeof repair.targetId === 'string' &&
                    typeof repair.correct === 'string',
                )
                .map((repair) => ({
                  targetId: String(repair.targetId),
                  correct: String(repair.correct),
                }))
            : [],
          orthographyRepairCorrectText:
            typeof answer.correctText === 'string' ? answer.correctText : '',
        },
      };
    }

    if (row.type === 'dictation') {
      return {
        success: true,
        item: {
          ...base,
          dictationTitle: typeof payload.title === 'string' ? payload.title : '',
          dictationAudioSrc:
            typeof payload.audioSrc === 'string' ? payload.audioSrc : '',
          dictationWaveform: Array.isArray(payload.waveform)
            ? payload.waveform.filter((v): v is number => typeof v === 'number')
            : [],
          dictationPlaybackRates: Array.isArray(payload.playbackRates)
            ? payload.playbackRates.filter((v): v is number => typeof v === 'number')
            : [],
          dictationText: typeof answer.text === 'string' ? answer.text : '',
          dictationCaseSensitive: Boolean(answer.caseSensitive),
          dictationIgnorePunctuation: Boolean(answer.ignorePunctuation),
        },
      };
    }

    if (row.type === 'order_fragments') {
      return {
        success: true,
        item: {
          ...base,
          orderFragments: Array.isArray(payload.fragments)
            ? payload.fragments
                .map((f) => (f ?? {}) as Record<string, unknown>)
                .filter((f) => typeof f.id === 'string' && typeof f.text === 'string')
                .map((f) => ({ id: String(f.id), text: String(f.text) }))
            : [],
          orderCorrectOrder: Array.isArray(answer.correctOrder)
            ? answer.correctOrder.filter((v): v is string => typeof v === 'string')
            : [],
        },
      };
    }

    if (row.type === 'punctuation_constructor') {
      return {
        success: true,
        item: {
          ...base,
          punctuationConstructorTokens: Array.isArray(payload.tokens)
            ? payload.tokens.filter((v): v is string => typeof v === 'string')
            : [],
          punctuationConstructorMarkBank: Array.isArray(payload.markBank)
            ? payload.markBank.filter((v): v is PunctuationConstructorMark =>
                typeof v === 'string',
              )
            : [],
          punctuationConstructorHints: Array.isArray(payload.hints)
            ? payload.hints.filter((v): v is string => typeof v === 'string')
            : [],
          punctuationConstructorGuidedSteps: Array.isArray(payload.guidedSteps)
            ? payload.guidedSteps
                .map((s) => (s ?? {}) as Record<string, unknown>)
                .filter(
                  (s) =>
                    typeof s.id === 'string' &&
                    typeof s.title === 'string' &&
                    typeof s.slotIndex === 'number',
                )
                .map((s) => ({
                  id: String(s.id),
                  title: String(s.title),
                  slotIndex: Number(s.slotIndex),
                  marks: Array.isArray(s.marks)
                    ? s.marks
                        .filter((mark): mark is string => typeof mark === 'string')
                        .map((mark) => mark as PunctuationConstructorMark)
                    : undefined,
                }))
            : [],
          punctuationConstructorSegments: Array.isArray(payload.segments)
            ? payload.segments
                .map((s) => (s ?? {}) as Record<string, unknown>)
                .filter(
                  (s) =>
                    typeof s.label === 'string' &&
                    typeof s.tokenStart === 'number' &&
                    typeof s.tokenEnd === 'number' &&
                    typeof s.kind === 'string',
                )
                .map((s) => ({
                  label: String(s.label),
                  tokenStart: Number(s.tokenStart),
                  tokenEnd: Number(s.tokenEnd),
                  kind: String(s.kind),
                }))
            : [],
          punctuationConstructorPlacements: Array.isArray(answer.placements)
            ? answer.placements
                .map((p) => (p ?? {}) as Record<string, unknown>)
                .filter(
                  (p) => typeof p.slotIndex === 'number' && typeof p.mark === 'string',
                )
                .map((p) => ({
                  slotIndex: Number(p.slotIndex),
                  mark: String(p.mark) as PunctuationConstructorMark,
                }))
            : [],
          punctuationConstructorSlotExplanations: Array.isArray(answer.slotExplanations)
            ? answer.slotExplanations
                .map((s) => (s ?? {}) as Record<string, unknown>)
                .filter(
                  (s) => typeof s.slotIndex === 'number' && typeof s.text === 'string',
                )
                .map((s) => ({
                  slotIndex: Number(s.slotIndex),
                  marks: Array.isArray(s.marks)
                    ? s.marks
                        .filter((mark): mark is string => typeof mark === 'string')
                        .map((mark) => mark as PunctuationConstructorMark)
                    : undefined,
                  text: String(s.text),
                }))
            : [],
        },
      };
    }

    if (row.type === 'ege20_complex_sentence_punctuation') {
      return {
        success: true,
        item: {
          ...base,
          ege20TextWithSlots:
            typeof payload.textWithSlots === 'string' ? payload.textWithSlots : '',
          ege20Slots: Array.isArray(payload.slots)
            ? payload.slots.filter((v): v is number => typeof v === 'number')
            : [],
          ege20TargetSet: Array.isArray(answer.targetSet)
            ? answer.targetSet.filter((v): v is number => typeof v === 'number')
            : [],
        },
      };
    }

    if (row.type === 'ege21_punctuation_analysis') {
      return {
        success: true,
        item: {
          ...base,
          ege21TargetPunctuation:
            typeof payload.targetPunctuation === 'string'
              ? payload.targetPunctuation
              : 'comma',
          ege21Sentences: Array.isArray(payload.sentences)
            ? payload.sentences
                .map((s) => (s ?? {}) as Record<string, unknown>)
                .filter((s) => typeof s.index === 'number' && typeof s.text === 'string')
                .map((s) => ({ index: Number(s.index), text: String(s.text) }))
            : [],
          ege21TargetSet: Array.isArray(answer.targetSet)
            ? answer.targetSet.filter((v): v is number => typeof v === 'number')
            : [],
        },
      };
    }

    return {
      success: true,
      item: {
        ...base,
        punctuationTokens: Array.isArray(payload.tokens) ? payload.tokens.filter((v): v is string => typeof v === 'string') : [],
        punctuationAllowedMarks: Array.isArray(payload.allowedMarks) ? payload.allowedMarks : [','],
        punctuationMarks: Array.isArray(answer.marks) ? answer.marks : [],
      },
    };
  } catch (error) {
    console.error('Failed to get exercise:', error);
    return { success: false, error: 'Unexpected error' };
  }
}

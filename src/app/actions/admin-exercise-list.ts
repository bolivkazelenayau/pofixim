'use server';

import { and, sql } from 'drizzle-orm';
import { db } from '@/db';
import { assertAdminAuthorized } from '@/lib/admin-auth';
import { logSlowServerAction } from '@/lib/slow-action-log';
import type { ExerciseListItem, ListExercisesParams } from './admin-list-types';
import {
  addCursorCondition,
  buildBaseExerciseListWhereParts,
  buildBlobSearchCondition,
  buildExerciseListResult,
  buildFastSearchCondition,
  buildNormalizedBlobSearchCondition,
  buildSearchCondition,
  countExercises,
  fetchExerciseListRows,
  isDigitsOnlySearchQuery,
  isSeedKeyLikeSearchQuery,
  mergeExerciseListRows,
  normalizeSearchBlobQuery,
  normalizeSearchQuery,
  shouldUseNormalizedBlobSearch,
} from './admin-exercise-list-query';

export async function getExerciseTypeOptions() {
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

export async function listExercises(params: ListExercisesParams = {}) {
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

    const baseWhereParts = buildBaseExerciseListWhereParts({
      type,
      qualityStatus,
      examType,
    });

    if (query && !includeTotal && !hasCursor) {
      const pattern = `%${query.toLowerCase()}%`;
      const fastQueryIsEligible =
        isDigitsOnlySearchQuery(query) || isSeedKeyLikeSearchQuery(query);
      const fastQueryShouldShortCircuit =
        isSeedKeyLikeSearchQuery(query) ||
        (isDigitsOnlySearchQuery(query) && query.length >= 3);
      const useNormalizedBlobSearch = shouldUseNormalizedBlobSearch(query);

      const fastRows = fastQueryIsEligible
        ? await fetchExerciseListRows({
            whereExpr: and(...baseWhereParts, buildFastSearchCondition(pattern)),
            sortBy,
            sortDir,
            normalizedLimit,
            normalizedOffset,
            useOffset: true,
          })
        : [];

      if (fastRows.length > 0 && (fastQueryShouldShortCircuit || fastRows.length > normalizedLimit)) {
        return buildExerciseListResult({
          rows: fastRows,
          normalizedLimit,
          normalizedOffset,
        });
      }

      const blobRows = await fetchExerciseListRows({
        whereExpr: and(...baseWhereParts, buildBlobSearchCondition(`%${blobQuery}%`)),
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
              buildNormalizedBlobSearchCondition(`%${normalizedQuery}%`),
            ),
            sortBy,
            sortDir,
            normalizedLimit,
            normalizedOffset,
            useOffset: true,
          })
        : [];

      return buildExerciseListResult({
        rows: mergeExerciseListRows(
          [...fastRows, ...blobRows, ...normalizedRows],
          sortBy,
          sortDir,
        ),
        normalizedLimit,
        normalizedOffset,
      });
    }

    const whereParts = [...baseWhereParts];
    if (query) {
      whereParts.push(
        buildSearchCondition({
          pattern: `%${query.toLowerCase()}%`,
          blobPattern: `%${blobQuery}%`,
          normalizedPattern: `%${normalizedQuery}%`,
          includeNormalizedBlob: shouldUseNormalizedBlobSearch(query),
        }),
      );
    }

    if (hasCursor) {
      addCursorCondition({ whereParts, cursorId, cursorUpdatedAt, sortBy, sortDir });
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

    return buildExerciseListResult({
      rows,
      normalizedLimit,
      normalizedOffset,
      total: includeTotal ? await countExercises(whereExpr) : undefined,
    });
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

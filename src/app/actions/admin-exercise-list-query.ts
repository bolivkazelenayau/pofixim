import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { exercises } from '@/db/schema';
import type { ExerciseListItem } from './admin-list-types';

export function normalizeSearchQuery(input: string) {
  return input
    .toLowerCase()
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSearchBlobQuery(input: string) {
  return input
    .toLowerCase()
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDigitsOnlySearchQuery(input: string) {
  return /^\d+$/u.test(input);
}

export function isSeedKeyLikeSearchQuery(input: string) {
  return /^[a-z0-9:_-]+$/iu.test(input) && /[a-z:_-]/iu.test(input);
}

export function shouldUseNormalizedBlobSearch(input: string) {
  return /[*_~[\]()<>{}|\\]/u.test(input) || /\s{2,}/u.test(input);
}

export function buildBaseExerciseListWhereParts(input: {
  type: string;
  qualityStatus: string;
  examType: string;
}) {
  const { type, qualityStatus, examType } = input;
  const baseWhereParts = [sql`${exercises.id} is not null`];

  if (type !== 'all') {
    baseWhereParts.push(eq(exercises.type, type as typeof exercises.type._.data));
  }

  if (qualityStatus !== 'all') {
    baseWhereParts.push(eq(exercises.qualityStatus, qualityStatus));
  }

  if (examType !== 'all') {
    baseWhereParts.push(
      sql`${exercises.skillTags} @> array[${`ege.${examType}`}]::text[]`,
    );
  }

  return baseWhereParts;
}

export function buildFastSearchCondition(pattern: string) {
  return sql`(
    cast(${exercises.id} as text) ilike ${pattern}
    or lower(coalesce(${exercises.seedKey}, '')) like ${pattern}
  )`;
}

export function buildBlobSearchCondition(blobPattern: string) {
  return sql`${exercises.searchBlob} like ${blobPattern}`;
}

export function buildNormalizedBlobSearchCondition(normalizedPattern: string) {
  return sql`${exercises.searchBlobNormalized} like ${normalizedPattern}`;
}

export function buildSearchCondition(input: {
  pattern: string;
  blobPattern: string;
  normalizedPattern: string;
  includeNormalizedBlob: boolean;
}) {
  const { pattern, blobPattern, normalizedPattern, includeNormalizedBlob } = input;

  if (includeNormalizedBlob) {
    return sql`(
      ${buildFastSearchCondition(pattern)}
      or ${buildBlobSearchCondition(blobPattern)}
      or ${buildNormalizedBlobSearchCondition(normalizedPattern)}
    )`;
  }

  return sql`(
    ${buildFastSearchCondition(pattern)}
    or ${buildBlobSearchCondition(blobPattern)}
  )`;
}

export function buildUpdatedAtCursorCondition(input: {
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

export function addCursorCondition(input: {
  whereParts: ReturnType<typeof buildBaseExerciseListWhereParts>;
  cursorId: number;
  cursorUpdatedAt: string;
  sortBy: 'id' | 'updatedAt';
  sortDir: 'asc' | 'desc';
}) {
  const { whereParts, cursorId, cursorUpdatedAt, sortBy, sortDir } = input;

  if (sortBy === 'id') {
    if (sortDir === 'desc') whereParts.push(lt(exercises.id, cursorId));
    else whereParts.push(sql`${exercises.id} > ${cursorId}`);
  }

  if (sortBy === 'updatedAt' && cursorUpdatedAt) {
    whereParts.push(buildUpdatedAtCursorCondition({ cursorId, cursorUpdatedAt, sortDir }));
  }
}

export async function fetchExerciseListRows(input: {
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
      explanation: sql<string>`''`,
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

export type ExerciseListRow = Awaited<ReturnType<typeof fetchExerciseListRows>>[number];

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

export function mergeExerciseListRows(
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

export function buildExerciseListResult(input: {
  rows: ExerciseListRow[];
  normalizedLimit: number;
  normalizedOffset: number;
  total?: number;
}) {
  const { rows, normalizedLimit, normalizedOffset } = input;
  const hasMore = rows.length > normalizedLimit;
  const pageRows = hasMore ? rows.slice(0, normalizedLimit) : rows;
  const items: ExerciseListItem[] = pageRows.map((row) => ({
    id: row.id,
    type: row.type,
    skillTags: row.skillTags,
    seedKey: row.seedKey,
    prompt: row.prompt,
    explanation: row.explanation,
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
    total: input.total ?? estimatedTotal,
    hasMore,
    nextOffset: normalizedOffset + items.length,
    nextCursorId: last ? last.id : null,
    nextCursorUpdatedAt: last ? last.updatedAtCursor : null,
  };
}

export async function countExercises(whereExpr: ReturnType<typeof and>) {
  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(exercises)
    .where(whereExpr);

  return Number(totalRows[0]?.count ?? 0);
}

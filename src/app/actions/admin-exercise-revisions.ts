import { desc, eq } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { db } from '@/db';
import { exerciseRevisions, exercises } from '@/db/schema';
import { assertAdminAuthorized } from '@/lib/admin-auth';

type ExerciseRow = InferSelectModel<typeof exercises>;
type RevisionWriter = Pick<typeof db, 'insert'>;

export type ExerciseRevisionAction = 'baseline' | 'create' | 'update' | 'delete' | 'batch_update';

type ExerciseRevisionSnapshot = Record<string, unknown> | null;

const SNAPSHOT_FIELDS = [
  'id',
  'seedKey',
  'type',
  'category',
  'difficulty',
  'skillTags',
  'prompt',
  'payload',
  'answer',
  'explanation',
  'searchBlob',
  'searchBlobNormalized',
  'sourceAlignment',
  'typicalMistake',
  'mistakeModel',
  'algorithmSteps',
  'transferGroup',
  'qualityStatus',
  'visualHint',
  'isActive',
] as const satisfies readonly (keyof ExerciseRow)[];

function normalizeJson(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeJson(item)]),
  );
}

function stableStringify(value: unknown) {
  return JSON.stringify(normalizeJson(value));
}

export function buildExerciseRevisionSnapshot(
  row: ExerciseRow | null | undefined,
): ExerciseRevisionSnapshot {
  if (!row) return null;

  return Object.fromEntries(
    SNAPSHOT_FIELDS.map((field) => [field, normalizeJson(row[field])]),
  );
}

export function getExerciseRevisionChangedFields(
  snapshotBefore: ExerciseRevisionSnapshot,
  snapshotAfter: ExerciseRevisionSnapshot,
) {
  const fields = new Set<string>([
    ...Object.keys(snapshotBefore ?? {}),
    ...Object.keys(snapshotAfter ?? {}),
  ]);

  return Array.from(fields)
    .filter((field) => stableStringify(snapshotBefore?.[field]) !== stableStringify(snapshotAfter?.[field]))
    .sort((left, right) => left.localeCompare(right));
}

export async function recordExerciseRevision(
  writer: RevisionWriter,
  input: {
    exerciseId: number;
    action: ExerciseRevisionAction;
    before?: ExerciseRow | null;
    after?: ExerciseRow | null;
    actorLabel?: string;
  },
) {
  const snapshotBefore = buildExerciseRevisionSnapshot(input.before);
  const snapshotAfter = buildExerciseRevisionSnapshot(input.after);
  const changedFields = getExerciseRevisionChangedFields(snapshotBefore, snapshotAfter);

  if (input.action === 'update' && changedFields.length === 0) return;
  if (input.action === 'batch_update' && changedFields.length === 0) return;

  await writer.insert(exerciseRevisions).values({
    exerciseId: input.exerciseId,
    action: input.action,
    actorLabel: input.actorLabel ?? 'admin',
    changedFields,
    snapshotBefore,
    snapshotAfter,
  });
}

export async function listExerciseRevisions(exerciseId: number, limit = 20) {
  await assertAdminAuthorized();

  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return { success: false as const, error: 'Invalid exercise id' };
  }

  const rows = await db
    .select({
      id: exerciseRevisions.id,
      exerciseId: exerciseRevisions.exerciseId,
      action: exerciseRevisions.action,
      actorLabel: exerciseRevisions.actorLabel,
      changedFields: exerciseRevisions.changedFields,
      snapshotBefore: exerciseRevisions.snapshotBefore,
      snapshotAfter: exerciseRevisions.snapshotAfter,
      createdAt: exerciseRevisions.createdAt,
    })
    .from(exerciseRevisions)
    .where(eq(exerciseRevisions.exerciseId, exerciseId))
    .orderBy(desc(exerciseRevisions.createdAt), desc(exerciseRevisions.id))
    .limit(Math.min(Math.max(limit, 1), 50));

  return {
    success: true as const,
    items: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      snapshotBefore: row.snapshotBefore as ExerciseRevisionSnapshot,
      snapshotAfter: row.snapshotAfter as ExerciseRevisionSnapshot,
    })),
  };
}

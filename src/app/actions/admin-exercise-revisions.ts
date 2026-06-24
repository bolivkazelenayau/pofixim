import { and, desc, eq, lt } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { db } from '@/db';
import { exerciseRevisions, exercises } from '@/db/schema';
import { assertAdminAuthorized } from '@/lib/admin-auth';

type ExerciseRow = InferSelectModel<typeof exercises>;
type RevisionWriter = Pick<typeof db, 'insert' | 'select'>;

export type ExerciseRevisionSource =
  | 'manual'
  | 'autosave'
  | 'batch'
  | 'import'
  | 'generator'
  | 'create'
  | 'baseline'
  | 'delete';

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

function buildRevisionSummary(source: ExerciseRevisionSource, changedFields: string[]) {
  if (source === 'create') return 'Created exercise snapshot';
  if (source === 'baseline') return 'Baseline snapshot';
  if (source === 'delete') return 'Deleted exercise snapshot';
  if (changedFields.length === 0) return 'No snapshot fields changed';

  const visible = changedFields.slice(0, 4).join(', ');
  const rest = changedFields.length > 4 ? ` +${changedFields.length - 4}` : '';
  return `Changed ${visible}${rest}`;
}

async function getNextRevisionVersion(writer: RevisionWriter, exerciseId: number) {
  const rows = await writer
    .select({ version: exerciseRevisions.version })
    .from(exerciseRevisions)
    .where(eq(exerciseRevisions.exerciseId, exerciseId))
    .orderBy(desc(exerciseRevisions.version), desc(exerciseRevisions.id))
    .limit(1);

  return (rows[0]?.version ?? 0) + 1;
}

async function getPreviousRevisionSnapshot(
  exerciseId: number,
  version: number,
): Promise<ExerciseRevisionSnapshot> {
  const rows = await db
    .select({ snapshot: exerciseRevisions.snapshot })
    .from(exerciseRevisions)
    .where(and(eq(exerciseRevisions.exerciseId, exerciseId), lt(exerciseRevisions.version, version)))
    .orderBy(desc(exerciseRevisions.version), desc(exerciseRevisions.id))
    .limit(1);

  return rows[0]?.snapshot as ExerciseRevisionSnapshot ?? null;
}

export async function recordExerciseRevision(
  writer: RevisionWriter,
  input: {
    exerciseId: number;
    source: ExerciseRevisionSource;
    before?: ExerciseRow | null;
    after?: ExerciseRow | null;
    actorLabel?: string;
    batchId?: string | null;
    summary?: string | null;
  },
) {
  const snapshot = buildExerciseRevisionSnapshot(input.after ?? input.before);
  if (!snapshot) return;

  const previousSnapshot = buildExerciseRevisionSnapshot(input.before);
  const changedFields = getExerciseRevisionChangedFields(previousSnapshot, snapshot);

  if (input.source === 'manual' && changedFields.length === 0) return;
  if (input.source === 'batch' && changedFields.length === 0) return;

  const version = await getNextRevisionVersion(writer, input.exerciseId);

  await writer.insert(exerciseRevisions).values({
    exerciseId: input.exerciseId,
    version,
    source: input.source,
    actorLabel: input.actorLabel ?? null,
    batchId: input.batchId ?? null,
    snapshot,
    changedFields,
    summary: input.summary ?? buildRevisionSummary(input.source, changedFields),
  });
}

export async function recordExerciseRevisionBestEffort(
  input: Parameters<typeof recordExerciseRevision>[1],
) {
  try {
    await recordExerciseRevision(db, input);
  } catch (error) {
    console.error('Failed to record exercise revision:', error);
  }
}

export async function listExerciseRevisions(exerciseId: number, limit = 20) {
  await assertAdminAuthorized();

  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return { success: false as const, error: 'Invalid exercise id' };
  }

  try {
    const rows = await db
      .select({
        id: exerciseRevisions.id,
        exerciseId: exerciseRevisions.exerciseId,
        version: exerciseRevisions.version,
        source: exerciseRevisions.source,
        actorLabel: exerciseRevisions.actorLabel,
        batchId: exerciseRevisions.batchId,
        changedFields: exerciseRevisions.changedFields,
        summary: exerciseRevisions.summary,
        createdAt: exerciseRevisions.createdAt,
      })
      .from(exerciseRevisions)
      .where(eq(exerciseRevisions.exerciseId, exerciseId))
      .orderBy(desc(exerciseRevisions.version), desc(exerciseRevisions.id))
      .limit(Math.min(Math.max(limit, 1), 50));

    return {
      success: true as const,
      items: rows.map((row) => ({
        ...row,
        actorLabel: row.actorLabel ?? null,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      })),
    };
  } catch (error) {
    console.error('Failed to list exercise revisions:', error);
    return {
      success: false as const,
      error: 'История ревизий недоступна. Примените миграцию exercise_revisions.',
    };
  }
}

export async function getExerciseRevisionDetail(exerciseId: number, revisionId: number) {
  await assertAdminAuthorized();

  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return { success: false as const, error: 'Invalid exercise id' };
  }
  if (!Number.isInteger(revisionId) || revisionId <= 0) {
    return { success: false as const, error: 'Invalid revision id' };
  }

  try {
    const rows = await db
      .select({
        id: exerciseRevisions.id,
        exerciseId: exerciseRevisions.exerciseId,
        version: exerciseRevisions.version,
        source: exerciseRevisions.source,
        actorLabel: exerciseRevisions.actorLabel,
        batchId: exerciseRevisions.batchId,
        changedFields: exerciseRevisions.changedFields,
        summary: exerciseRevisions.summary,
        snapshot: exerciseRevisions.snapshot,
        createdAt: exerciseRevisions.createdAt,
      })
      .from(exerciseRevisions)
      .where(and(eq(exerciseRevisions.id, revisionId), eq(exerciseRevisions.exerciseId, exerciseId)))
      .limit(1);

    const row = rows[0];
    if (!row) return { success: false as const, error: 'Revision not found' };

    const previousSnapshot = await getPreviousRevisionSnapshot(row.exerciseId, row.version);
    const snapshot = row.snapshot as ExerciseRevisionSnapshot;

    return {
      success: true as const,
      item: {
        ...row,
        actorLabel: row.actorLabel ?? null,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        snapshot,
        previousSnapshot,
        changedFields: getExerciseRevisionChangedFields(previousSnapshot, snapshot),
      },
    };
  } catch (error) {
    console.error('Failed to get exercise revision detail:', error);
    return {
      success: false as const,
      error: 'Ревизия недоступна. Примените миграцию exercise_revisions.',
    };
  }
}

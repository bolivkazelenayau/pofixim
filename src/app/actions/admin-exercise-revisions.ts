import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { db } from '@/db';
import { exerciseRevisions, exercises } from '@/db/schema';
import { assertAdminAuthorized } from '@/lib/admin-auth';
import { refreshExerciseAdminCaches } from './admin-exercise-save';

type ExerciseRow = InferSelectModel<typeof exercises>;
type RevisionWriter = Pick<typeof db, 'delete' | 'insert' | 'select'>;

export type ExerciseRevisionSource =
  | 'manual'
  | 'autosave'
  | 'batch'
  | 'import'
  | 'generator'
  | 'create'
  | 'baseline'
  | 'restore'
  | 'delete';

type ExerciseRevisionSnapshot = Record<string, unknown> | null;
type RecentExerciseRevision = {
  id: number;
  version: number;
  source: string;
  snapshot: unknown;
};

const COMPACTABLE_REVISION_SOURCES = new Set<ExerciseRevisionSource>(['manual', 'autosave']);
const DELETABLE_REVISION_SOURCES = new Set<ExerciseRevisionSource>(['manual', 'autosave', 'restore']);

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

function snapshotsEqual(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
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
  if (source === 'restore') return 'Restored exercise snapshot';
  if (source === 'delete') return 'Deleted exercise snapshot';
  if (changedFields.length === 0) return 'No snapshot fields changed';

  const visible = changedFields.slice(0, 4).join(', ');
  const rest = changedFields.length > 4 ? ` +${changedFields.length - 4}` : '';
  return `Changed ${visible}${rest}`;
}

async function getRecentExerciseRevisions(writer: RevisionWriter, exerciseId: number) {
  return writer
    .select({
      id: exerciseRevisions.id,
      version: exerciseRevisions.version,
      source: exerciseRevisions.source,
      snapshot: exerciseRevisions.snapshot,
    })
    .from(exerciseRevisions)
    .where(eq(exerciseRevisions.exerciseId, exerciseId))
    .orderBy(desc(exerciseRevisions.version), desc(exerciseRevisions.id))
    .limit(2);
}

function shouldCompactRevertedRevision(input: {
  source: ExerciseRevisionSource;
  previousSnapshot: ExerciseRevisionSnapshot;
  snapshot: ExerciseRevisionSnapshot;
  latestRevision?: RecentExerciseRevision;
  penultimateRevision?: RecentExerciseRevision;
}) {
  if (!COMPACTABLE_REVISION_SOURCES.has(input.source)) return false;
  if (!input.previousSnapshot || !input.snapshot) return false;
  if (!input.latestRevision || !input.penultimateRevision) return false;
  if (!COMPACTABLE_REVISION_SOURCES.has(input.latestRevision.source as ExerciseRevisionSource)) return false;

  return (
    snapshotsEqual(input.previousSnapshot, input.latestRevision.snapshot)
    && snapshotsEqual(input.snapshot, input.penultimateRevision.snapshot)
  );
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

function getSnapshotRecord(snapshot: unknown): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  return snapshot as Record<string, unknown>;
}

function getRequiredString(snapshot: Record<string, unknown>, field: string) {
  const value = snapshot[field];
  if (typeof value !== 'string') throw new Error(`Revision snapshot field "${field}" is invalid`);
  return value;
}

function getOptionalString(snapshot: Record<string, unknown>, field: string) {
  const value = snapshot[field];
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error(`Revision snapshot field "${field}" is invalid`);
  return value;
}

function getRequiredNumber(snapshot: Record<string, unknown>, field: string) {
  const value = snapshot[field];
  if (typeof value !== 'number') throw new Error(`Revision snapshot field "${field}" is invalid`);
  return value;
}

function getRequiredStringArray(snapshot: Record<string, unknown>, field: string) {
  const value = snapshot[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Revision snapshot field "${field}" is invalid`);
  }
  return value;
}

function getRequiredJson(snapshot: Record<string, unknown>, field: string) {
  if (!(field in snapshot) || snapshot[field] == null) {
    throw new Error(`Revision snapshot field "${field}" is invalid`);
  }
  return snapshot[field];
}

function buildExerciseRestoreValues(snapshot: ExerciseRevisionSnapshot, exerciseId: number) {
  const record = getSnapshotRecord(snapshot);
  if (!record) throw new Error('Revision snapshot is invalid');
  if (getRequiredNumber(record, 'id') !== exerciseId) {
    throw new Error('Revision snapshot belongs to another exercise');
  }

  return {
    seedKey: getOptionalString(record, 'seedKey'),
    type: getRequiredString(record, 'type') as ExerciseRow['type'],
    category: getRequiredString(record, 'category') as ExerciseRow['category'],
    difficulty: getRequiredNumber(record, 'difficulty'),
    skillTags: getRequiredStringArray(record, 'skillTags'),
    prompt: getRequiredString(record, 'prompt'),
    payload: getRequiredJson(record, 'payload'),
    answer: getRequiredJson(record, 'answer'),
    explanation: getRequiredString(record, 'explanation'),
    searchBlob: getOptionalString(record, 'searchBlob'),
    searchBlobNormalized: getOptionalString(record, 'searchBlobNormalized'),
    sourceAlignment: record.sourceAlignment ?? null,
    typicalMistake: getOptionalString(record, 'typicalMistake'),
    mistakeModel: record.mistakeModel ?? null,
    algorithmSteps: record.algorithmSteps ?? null,
    transferGroup: getOptionalString(record, 'transferGroup'),
    qualityStatus: getRequiredString(record, 'qualityStatus'),
    visualHint: record.visualHint ?? null,
    isActive: typeof record.isActive === 'boolean' ? record.isActive : true,
    updatedAt: sql`now()::timestamp`,
  };
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

  const [latestRevision, penultimateRevision] = await getRecentExerciseRevisions(writer, input.exerciseId);
  if (
    shouldCompactRevertedRevision({
      source: input.source,
      previousSnapshot,
      snapshot,
      latestRevision,
      penultimateRevision,
    })
  ) {
    await writer.delete(exerciseRevisions).where(eq(exerciseRevisions.id, latestRevision.id));
    return;
  }

  const version = (latestRevision?.version ?? 0) + 1;

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
        createdAt: sql<string>`${exerciseRevisions.createdAt}::text`,
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
        createdAt: row.createdAt,
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
        createdAt: sql<string>`${exerciseRevisions.createdAt}::text`,
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
        createdAt: row.createdAt,
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

export async function restoreExerciseRevision(exerciseId: number, revisionId: number) {
  await assertAdminAuthorized();

  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return { success: false as const, error: 'Invalid exercise id' };
  }
  if (!Number.isInteger(revisionId) || revisionId <= 0) {
    return { success: false as const, error: 'Invalid revision id' };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const revisionRows = await tx
        .select({
          version: exerciseRevisions.version,
          snapshot: exerciseRevisions.snapshot,
        })
        .from(exerciseRevisions)
        .where(and(eq(exerciseRevisions.id, revisionId), eq(exerciseRevisions.exerciseId, exerciseId)))
        .limit(1);

      const revision = revisionRows[0];
      if (!revision) return { success: false as const, error: 'Revision not found' };

      const beforeRows = await tx.select().from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
      const before = beforeRows[0] ?? null;
      if (!before) return { success: false as const, error: 'Exercise not found' };

      const targetSnapshot = revision.snapshot as ExerciseRevisionSnapshot;
      if (snapshotsEqual(buildExerciseRevisionSnapshot(before), targetSnapshot)) {
        return {
          success: true as const,
          alreadyCurrent: true,
          restoredVersion: revision.version,
          updatedAt: before.updatedAt instanceof Date ? before.updatedAt.toISOString() : String(before.updatedAt),
        };
      }

      const restoreValues = buildExerciseRestoreValues(targetSnapshot, exerciseId);
      const restoredRows = await tx
        .update(exercises)
        .set(restoreValues)
        .where(eq(exercises.id, exerciseId))
        .returning();

      const restored = restoredRows[0] ?? null;
      if (!restored) return { success: false as const, error: 'Exercise not found' };

      await recordExerciseRevision(tx, {
        exerciseId,
        source: 'restore',
        before,
        after: restored,
        actorLabel: 'admin',
        summary: `Restored revision v${revision.version}`,
      });

      return {
        success: true as const,
        alreadyCurrent: false,
        restoredVersion: revision.version,
        updatedAt: restored.updatedAt instanceof Date ? restored.updatedAt.toISOString() : String(restored.updatedAt),
      };
    });

    if (result.success) refreshExerciseAdminCaches();
    return result;
  } catch (error) {
    console.error('Failed to restore exercise revision:', error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Не удалось восстановить ревизию.',
    };
  }
}

export async function deleteExerciseRevision(exerciseId: number, revisionId: number) {
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
        source: exerciseRevisions.source,
        version: exerciseRevisions.version,
      })
      .from(exerciseRevisions)
      .where(and(eq(exerciseRevisions.id, revisionId), eq(exerciseRevisions.exerciseId, exerciseId)))
      .limit(1);

    const revision = rows[0];
    if (!revision) return { success: false as const, error: 'Revision not found' };
    if (!DELETABLE_REVISION_SOURCES.has(revision.source as ExerciseRevisionSource)) {
      return {
        success: false as const,
        error: 'Эту ревизию нельзя удалить: это системная или импортная запись истории.',
      };
    }

    await db
      .delete(exerciseRevisions)
      .where(and(eq(exerciseRevisions.id, revisionId), eq(exerciseRevisions.exerciseId, exerciseId)));

    return { success: true as const, deletedVersion: revision.version };
  } catch (error) {
    console.error('Failed to delete exercise revision:', error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Не удалось удалить ревизию.',
    };
  }
}

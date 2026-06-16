import { exercises } from '@/db/schema';
import { exerciseSchema } from '@/features/exercises/schemas';
import { stripEge18PromptFromFillBefore } from '@/lib/exercise-type-conversion';

export const invalidExerciseIds = new Set<number>();

export function dbExerciseToDomainExercise(row: typeof exercises.$inferSelect | undefined) {
  if (!row) {
    return null;
  }

  const payload =
    row.type === 'fill_blank' &&
    row.skillTags.includes('ege.18') &&
    row.payload &&
    typeof row.payload === 'object' &&
    !Array.isArray(row.payload)
      ? {
          ...(row.payload as Record<string, unknown>),
          before:
            typeof (row.payload as Record<string, unknown>).before === 'string'
              ? stripEge18PromptFromFillBefore(
                  (row.payload as Record<string, unknown>).before as string,
                  row.prompt,
                )
              : (row.payload as Record<string, unknown>).before,
        }
      : row.payload;

  const parsed = exerciseSchema.safeParse({
    id: row.id,
    seedKey: row.seedKey,
    type: row.type,
    category: row.category,
    difficulty: row.difficulty,
    skillTags: row.skillTags,
    prompt: row.prompt,
    payload,
    answer: row.answer,
    explanation: row.explanation,
    sourceAlignment: row.sourceAlignment ?? extractLegacySourceAlignment(row.visualHint),
    typicalMistake: row.typicalMistake ?? extractLegacyTypicalMistake(row.visualHint),
    mistakeModel: row.mistakeModel ?? undefined,
    algorithmSteps: row.algorithmSteps ?? extractLegacyAlgorithmSteps(row.visualHint),
    transferGroup: row.transferGroup ?? undefined,
    qualityStatus: normalizeQualityStatus(row.qualityStatus),
    visualHint: row.visualHint ?? undefined,
    isActive: row.isActive,
  });

  if (!parsed.success) {
    if (row.id) invalidExerciseIds.add(row.id);
    console.warn('Skipped invalid exercise row', {
      id: row.id,
      type: row.type,
      seedKey: row.seedKey,
      qualityStatus: row.qualityStatus,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return null;
  }

  return parsed.data;
}

function extractLegacySourceAlignment(visualHint: unknown) {
  if (!visualHint || typeof visualHint !== 'object') {
    return undefined;
  }

  return (visualHint as Record<string, unknown>).sourceAlignment;
}

function extractLegacyTypicalMistake(visualHint: unknown) {
  if (!visualHint || typeof visualHint !== 'object') {
    return undefined;
  }

  const value = (visualHint as Record<string, unknown>).typicalMistake;
  return typeof value === 'string' ? value : undefined;
}

function extractLegacyAlgorithmSteps(visualHint: unknown) {
  if (!visualHint || typeof visualHint !== 'object') {
    return undefined;
  }

  const value = (visualHint as Record<string, unknown>).solutionSteps;

  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((step): step is string => typeof step === 'string' && step.trim().length > 0)
    .map((title, index) => ({
      id: `legacy_${index + 1}`,
      title,
      required: true,
    }));
}

function normalizeQualityStatus(value: unknown) {
  if (value === 'review' || value === 'approved' || value === 'archived') {
    return value;
  }

  return 'draft';
}

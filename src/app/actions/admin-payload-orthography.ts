import type { ExerciseEditorInput } from './admin-types';
import type { AdminExercisePayloadBase } from './admin-payload-types';

export function buildOrthographyRepairPayload(
  input: ExerciseEditorInput,
  base: AdminExercisePayloadBase,
) {
  const targets = (input.orthographyRepairTargets ?? [])
    .map((target) => ({
      id: target.id.trim(),
      surface: target.surface.trim(),
      replacement: target.replacement.trim(),
      type: target.type,
      options: target.options?.map((option) => option.trim()).filter(Boolean),
      occurrence: target.occurrence,
    }))
    .filter(
      (target) =>
        target.id.length > 0 &&
        target.surface.length > 0 &&
        target.replacement.length > 0,
    );
  const safeTargets =
    targets.length > 0
      ? targets
      : [
          {
            id: 'target_1',
            surface: 'ошыбка',
            replacement: 'ошибка',
            type: 'word' as const,
            options: ['ошыбка', 'ошибка'],
          },
        ];
  const targetIds = new Set(safeTargets.map((target) => target.id));
  const repairs = (input.orthographyRepairRepairs ?? [])
    .map((repair) => ({
      targetId: repair.targetId.trim(),
      correct: repair.correct.trim(),
    }))
    .filter((repair) => repair.targetId.length > 0 && repair.correct.length > 0);
  const safeRepairs =
    repairs.length > 0
      ? repairs.filter((repair) => targetIds.has(repair.targetId))
      : safeTargets.map((target) => ({
          targetId: target.id,
          correct: target.replacement,
        }));

  return {
    ...base,
    payload: {
      text:
        (input.orthographyRepairText ?? '').trim() ||
        `Найдите слово: ${safeTargets[0].surface}.`,
      mode: input.orthographyRepairMode ?? 'click_then_choose',
      targets: safeTargets,
      ...((input.orthographyRepairHints ?? []).length > 0
        ? { hints: input.orthographyRepairHints }
        : {}),
    },
    answer: {
      repairs:
        safeRepairs.length > 0
          ? safeRepairs
          : safeTargets.map((target) => ({
              targetId: target.id,
              correct: target.replacement,
            })),
      ...((input.orthographyRepairCorrectText ?? '').trim()
        ? { correctText: input.orthographyRepairCorrectText?.trim() }
        : {}),
    },
  };
}

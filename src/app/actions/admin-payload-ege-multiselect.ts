import type { ExerciseEditorInput } from './admin-types';
import type { AdminExercisePayloadBase } from './admin-payload-types';
import {
  buildCorrectAnswerLinesFromOptions,
  normalizeMorphemeMarkdownSpacing,
  splitFeedbackFromExplanation,
} from './admin-payload-ege-multiselect-feedback';

export function buildEgeMultiSelectPayload(
  input: ExerciseEditorInput,
  base: AdminExercisePayloadBase,
) {
  const normalizedOptions = (input.options ?? []).map((v) => v.trim()).filter(Boolean);
  const options =
    normalizedOptions.length >= 2 ? normalizedOptions : ['Вариант 1', 'Вариант 2'];
  const targetSet = [...new Set((input.multiCorrectOptionIndexes ?? []).map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))].sort((a, b) => a - b);
  const safeTargetSet = targetSet.filter((idx) => idx <= options.length);
  const signature = safeTargetSet.join('');
  const isEge10 = input.skillTags.some((tag) => tag.trim() === 'ege.10');
  const parsedFeedback = isEge10
    ? splitFeedbackFromExplanation(base.explanation, options)
    : null;
  const correctAnswer = buildCorrectAnswerLinesFromOptions(
    options,
    safeTargetSet,
    parsedFeedback?.explanation ?? [],
  );
  const structuredFeedback =
    isEge10 && correctAnswer.length
      ? {
          correctAnswer,
          explanation: parsedFeedback?.explanation.length
            ? parsedFeedback.explanation
            : [normalizeMorphemeMarkdownSpacing(base.explanation)],
        }
      : null;
  const explanation = isEge10
    ? parsedFeedback?.explanation.join('\n') ?? normalizeMorphemeMarkdownSpacing(base.explanation)
    : base.explanation;
  return {
    ...base,
    explanation,
    payload: {
      options,
      ...(structuredFeedback ? { feedback: structuredFeedback } : {}),
    },
    answer: {
      rawAnswerText: signature || '1',
      acceptedAnswers: signature ? [signature] : ['1'],
      targetSet: safeTargetSet.length ? safeTargetSet : [1],
    },
  };
}

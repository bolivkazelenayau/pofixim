import type {
  ExerciseEditorInput,
  PunctuationConstructorMark,
} from './admin-types';
import type { AdminExercisePayloadBase } from './admin-payload-types';

export function buildPunctuationConstructorPayload(
  input: ExerciseEditorInput,
  base: AdminExercisePayloadBase,
) {
  const tokens = (input.punctuationConstructorTokens ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  const safeTokens =
    tokens.length >= 2 ? tokens : ['Мне', 'сказали', 'Ждите', 'придет'];
  const markBank =
    input.punctuationConstructorMarkBank &&
    input.punctuationConstructorMarkBank.length > 0
      ? [...new Set(input.punctuationConstructorMarkBank)]
      : ([
          'period',
          'comma',
          'semicolon',
          'colon',
          'question',
          'exclamation',
          'quote_open',
          'quote_close',
          'paren_open',
          'paren_close',
          'dash',
          'ellipsis',
        ] satisfies PunctuationConstructorMark[]);
  const markSet = new Set(markBank);
  const placements = (input.punctuationConstructorPlacements ?? [])
    .filter(
      (placement) =>
        Number.isInteger(placement.slotIndex) &&
        placement.slotIndex >= 0 &&
        placement.slotIndex <= safeTokens.length &&
        markSet.has(placement.mark),
    )
    .map((placement) => ({
      slotIndex: placement.slotIndex,
      mark: placement.mark,
    }));

  return {
    ...base,
    payload: {
      tokens: safeTokens,
      markBank,
      ...((input.punctuationConstructorHints ?? []).length > 0
        ? { hints: input.punctuationConstructorHints }
        : {}),
      ...((input.punctuationConstructorGuidedSteps ?? []).length > 0
        ? { guidedSteps: input.punctuationConstructorGuidedSteps }
        : {}),
      ...((input.punctuationConstructorSegments ?? []).length > 0
        ? { segments: input.punctuationConstructorSegments }
        : {}),
    },
    answer: {
      placements,
      ...((input.punctuationConstructorSlotExplanations ?? []).length > 0
        ? { slotExplanations: input.punctuationConstructorSlotExplanations }
        : {}),
    },
  };
}

import { normalizeNumberAnswerSignature } from '@/lib/exercise-type-conversion';
import type {
  EgeMultiSelectExercise,
  FillBlankExercise,
  MultipleChoiceExercise,
  OrderFragmentsExercise,
  SubmittedAnswer,
  WordBankClozeExercise,
  WordSearchExercise,
} from '../schemas';
import { buildResult } from './checkResult';
import {
  normalizeIndexSet,
  normalizeText,
  parseEge21Set,
  serializeIndexSet,
} from './checkUtils';

type CheckerOptions = { streak?: number; usedHint?: boolean };

export function checkMultipleChoice(
  exercise: MultipleChoiceExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'multiple_choice' }>,
  options: CheckerOptions,
) {
  const isCorrect =
    submittedAnswer.selectedOptionIndex === exercise.answer.correctOptionIndex;

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: submittedAnswer,
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_option',
            message: 'Selected option is not correct.',
            target: String(submittedAnswer.selectedOptionIndex),
          },
        ],
    options,
  });
}

export function checkFillBlank(
  exercise: FillBlankExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'fill_blank' }>,
  options: CheckerOptions,
) {
  const isEge18 = exercise.skillTags.includes('ege.18');
  const normalizedValue = isEge18
    ? normalizeNumberAnswerSignature(submittedAnswer.value)
    : normalizeText(
        submittedAnswer.value,
        exercise.answer.caseSensitive,
      );
  const accepted = exercise.answer.accepted
    .map((value) =>
      isEge18
        ? normalizeNumberAnswerSignature(value)
        : normalizeText(value, exercise.answer.caseSensitive),
    )
    .filter(Boolean);
  const isCorrect = accepted.includes(normalizedValue);

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      value: normalizedValue,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_blank_value',
            message: 'Submitted value is not accepted for this blank.',
            target: submittedAnswer.value,
          },
        ],
    options,
  });
}

export function checkOrderFragments(
  exercise: OrderFragmentsExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'order_fragments' }>,
  options: CheckerOptions,
) {
  const normalized = submittedAnswer.orderedFragmentIds.map((id) => id.trim());
  const expected = exercise.answer.correctOrder;
  const isCorrect =
    normalized.length === expected.length &&
    normalized.every((id, idx) => id === expected[idx]);

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      orderedFragmentIds: normalized,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_fragment_order',
            message: 'Submitted fragment order is not correct.',
            target: expected.join(' > '),
          },
        ],
    options,
  });
}

export function checkWordBankCloze(
  exercise: WordBankClozeExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'word_bank_cloze' }>,
  options: CheckerOptions,
) {
  const normalize = (value: string) => {
    const trimmed = value.trim().replace(/\s+/g, ' ');
    return exercise.answer.caseSensitive ? trimmed : trimmed.toLowerCase();
  };

  const submittedValues = submittedAnswer.values.map(normalize);
  const expectedValues = exercise.answer.correctBySlot.map(normalize);
  const isCorrect =
    submittedValues.length === expectedValues.length &&
    submittedValues.every((value, index) => value === expectedValues[index]);

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      values: submittedValues,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_word_bank_assignment',
            message: 'Words placed into slots are not correct.',
            target: expectedValues.join(' | '),
          },
        ],
    options,
  });
}

export function checkWordSearch(
  exercise: WordSearchExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'word_search' }>,
  options: CheckerOptions,
) {
  const normalize = (value: string) => {
    const trimmed = value.trim().replace(/\s+/g, ' ');
    return exercise.answer.caseSensitive ? trimmed : trimmed.toLowerCase();
  };
  const expected = [...new Set(exercise.answer.words.map(normalize))].sort();
  const submitted = [...new Set(submittedAnswer.foundWords.map(normalize))].sort();
  const isCorrect =
    expected.length === submitted.length &&
    expected.every((word, index) => word === submitted[index]);

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      foundWords: submitted,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_word_set',
            message: 'Found words set is not correct.',
            target: expected.join(', '),
          },
        ],
    options,
  });
}

export function checkEgeMultiSelect(
  exercise: EgeMultiSelectExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'ege_multi_select' }>,
  options: CheckerOptions,
) {
  const submittedSet = normalizeIndexSet(submittedAnswer.selectedOptionIndexes);
  const expectedSet = normalizeIndexSet(exercise.answer.targetSet);
  const submittedSignature = serializeIndexSet(submittedSet);
  const expectedSignature = serializeIndexSet(expectedSet);

  const acceptedSignatures = new Set(
    exercise.answer.acceptedAnswers.map((answer) =>
      serializeIndexSet(parseEge21Set(answer)),
    ),
  );

  const isCorrect =
    submittedSignature === expectedSignature ||
    acceptedSignatures.has(submittedSignature);

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      selectedOptionIndexes: submittedSet,
      signature: submittedSignature,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_option_set',
            message: 'Submitted set of options is not correct.',
            target: expectedSignature,
          },
        ],
    options,
  });
}

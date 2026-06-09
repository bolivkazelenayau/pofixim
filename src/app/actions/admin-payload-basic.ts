import {
  normalizeNumberAnswerSignature,
  stripEge18PromptFromFillBefore,
} from '@/lib/exercise-type-conversion';
import type { ExerciseEditorInput } from './admin-types';
import type { AdminExercisePayloadBase } from './admin-payload-types';

export function buildMultipleChoicePayload(
  input: ExerciseEditorInput,
  base: AdminExercisePayloadBase,
) {
  const normalizedOptions = (input.options ?? []).map((value) => value.trim()).filter(Boolean);
  const options = normalizedOptions.length >= 2 ? normalizedOptions : ['Вариант 1', 'Вариант 2'];
  const correctOptionIndex = Math.min(
    Math.max(input.correctOptionIndex ?? 0, 0),
    options.length - 1,
  );

  return {
    ...base,
    payload: { options },
    answer: { correctOptionIndex },
  };
}

export function buildFillBlankPayload(
  input: ExerciseEditorInput,
  base: AdminExercisePayloadBase,
) {
  const isEge18 = input.skillTags.some((tag) => tag.trim() === 'ege.18');
  const fillBefore = isEge18
    ? stripEge18PromptFromFillBefore(input.fillBefore ?? '', input.prompt)
    : input.fillBefore ?? '';
  const accepted = isEge18
    ? [
        normalizeNumberAnswerSignature(
          (input.fillAccepted ?? []).map((value) => value.trim()).filter(Boolean).join(','),
        ),
      ].filter(Boolean)
    : (input.fillAccepted ?? []).map((value) => value.trim()).filter(Boolean);

  return {
    ...base,
    payload: {
      before: fillBefore,
      after: input.fillAfter ?? '',
    },
    answer: {
      accepted: accepted.length ? accepted : ['пример'],
      caseSensitive: Boolean(input.fillCaseSensitive),
    },
  };
}

export function buildWordBankClozePayload(
  input: ExerciseEditorInput,
  base: AdminExercisePayloadBase,
) {
  const wordBank = (input.wordBankWords ?? []).map((value) => value.trim()).filter(Boolean);
  const correctBySlot = (input.wordBankCorrectBySlot ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  const slotCount = correctBySlot.length > 0 ? correctBySlot.length : 1;

  return {
    ...base,
    payload: {
      textWithSlots: (input.wordBankTextWithSlots ?? '').trim() || 'Текст [[1]] с пропуском.',
      slotCount,
      wordBank: wordBank.length > 0 ? wordBank : ['пример'],
    },
    answer: {
      correctBySlot: correctBySlot.length > 0 ? correctBySlot : ['пример'],
      caseSensitive: Boolean(input.wordBankCaseSensitive),
    },
  };
}

export function buildWordSearchPayload(
  input: ExerciseEditorInput,
  base: AdminExercisePayloadBase,
) {
  const rows = (input.wordSearchGridRows ?? []).map((value) => value.trim()).filter(Boolean);
  const grid =
    rows.length >= 2
      ? rows.map((line) => line.split('').filter(Boolean))
      : [
          ['?', '?', '?'],
          ['?', '?', '?'],
        ];
  const words = (input.wordSearchWords ?? []).map((value) => value.trim()).filter(Boolean);

  return {
    ...base,
    payload: {
      grid,
      words: words.length > 0 ? words : ['?'],
      allowDiagonal: true,
      allowReverse: true,
    },
    answer: {
      words: words.length > 0 ? words : ['?'],
      caseSensitive: Boolean(input.wordSearchCaseSensitive),
    },
  };
}

export function buildOrderFragmentsPayload(
  input: ExerciseEditorInput,
  base: AdminExercisePayloadBase,
) {
  const normalizedFragments = (input.orderFragments ?? [])
    .map((fragment) => ({
      id: (fragment.id ?? '').trim(),
      text: (fragment.text ?? '').trim(),
    }))
    .filter((fragment) => fragment.id.length > 0 && fragment.text.length > 0);
  const fragments =
    normalizedFragments.length >= 2
      ? normalizedFragments
      : [
          { id: 'f1', text: 'Первый фрагмент' },
          { id: 'f2', text: 'Второй фрагмент' },
        ];
  const idSet = new Set(fragments.map((fragment) => fragment.id));
  const normalizedOrder = (input.orderCorrectOrder ?? [])
    .map((id) => id.trim())
    .filter((id) => idSet.has(id));
  const correctOrder =
    normalizedOrder.length === fragments.length
      ? normalizedOrder
      : fragments.map((fragment) => fragment.id);

  return {
    ...base,
    payload: { fragments },
    answer: { correctOrder },
  };
}

export function buildPunctuationInsertPayload(
  input: ExerciseEditorInput,
  base: AdminExercisePayloadBase,
) {
  const tokens = (input.punctuationTokens ?? []).map((value) => value.trim()).filter(Boolean);

  return {
    ...base,
    payload: {
      tokens: tokens.length >= 2 ? tokens : ['Токен 1', 'Токен 2'],
      allowedMarks:
        (input.punctuationAllowedMarks ?? []).length > 0
          ? input.punctuationAllowedMarks!
          : [','],
    },
    answer: {
      marks: input.punctuationMarks ?? [],
    },
  };
}

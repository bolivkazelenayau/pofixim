import type { ExerciseEditorInput } from './admin-types';

function isLetterChar(value: string) {
  return /^\p{L}$/u.test(value);
}

function normalizeValidationText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateFillBlankBoundaries(input: ExerciseEditorInput): string | null {
  if (input.type !== 'fill_blank') {
    return null;
  }

  const before = (input.fillBefore ?? '').trimEnd();
  const after = (input.fillAfter ?? '').trimStart();
  const prompt = normalizeValidationText(input.prompt ?? '');
  const lastBefore = before.slice(-1);
  const firstAfter = after.slice(0, 1);
  const accepted = (input.fillAccepted ?? []).map((value) => value.trim()).filter(Boolean);
  const hasLetterAcceptedAnswer = accepted.some((value) => /\p{L}/u.test(value));
  const looksLikeNumberSignature = accepted.length > 0 && accepted.every((value) => /^\d[\d,\s.]*$/u.test(value));
  const looksLikeMultiSelectPrompt =
    prompt.includes('укажите варианты ответов') &&
    prompt.includes('запишите номера ответов');

  if (!lastBefore || !firstAfter) {
    if (!after && looksLikeMultiSelectPrompt && looksLikeNumberSignature) {
      return 'Этот fill_blank выглядит как задание с выбором номеров: текст после пропуска пустой, а допустимый ответ похож на "124". Для такого задания используйте ege_multi_select.';
    }
    return null;
  }

  // Legitimate fill_blank tasks often place the blank inside a word
  // (e.g. "вид" + "__" + "мый"). We only block word-internal splits when
  // the accepted answers do not look like letter fragments, which is a
  // strong signal of a broken cross-type conversion.
  if (hasLetterAcceptedAnswer) {
    return null;
  }

  if (isLetterChar(lastBefore) && isLetterChar(firstAfter)) {
    return 'Нельзя разрезать слово границей пропуска: заполните поля "Текст до пропуска" и "Текст после пропуска" по границе слова.';
  }

  return null;
}

function validateTypeSkillConsistency(input: ExerciseEditorInput): string | null {
  const tags = new Set((input.skillTags ?? []).map((t) => t.trim()).filter(Boolean));
  const prompt = (input.prompt ?? '').toLowerCase();
  const looksLikeEgeMultiSelect =
    prompt.includes('укажите варианты ответов') &&
    prompt.includes('запишите номера ответов');

  if (tags.has('ege.9') && looksLikeEgeMultiSelect && input.type !== 'ege_multi_select') {
    return 'Для формулировки ЕГЭ-9 с выбором номеров тип должен быть ege_multi_select, а не fill_blank.';
  }

  return null;
}

function validateAnswerCompleteness(input: ExerciseEditorInput): string | null {
  if (input.type === 'ege_multi_select') {
    const options = (input.options ?? []).map((value) => value.trim()).filter(Boolean);
    const targetSet = (input.multiCorrectOptionIndexes ?? [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (options.length < 2) {
      return 'Для ege_multi_select нужно заполнить как минимум два варианта ответа.';
    }

    if (targetSet.length === 0) {
      return 'Для ege_multi_select нужно указать правильные номера ответа.';
    }
  }

  if (input.type === 'fill_blank') {
    const accepted = (input.fillAccepted ?? []).map((value) => value.trim()).filter(Boolean);
    if (accepted.length === 0) {
      return 'Для fill_blank нужно указать допустимые ответы.';
    }
  }

  if (input.type === 'dictation') {
    if (!(input.dictationAudioSrc ?? '').trim()) {
      return 'Для dictation нужно указать путь к аудио.';
    }
    if (!(input.dictationText ?? '').trim()) {
      return 'Для dictation нужно указать эталонную расшифровку.';
    }
  }

  return null;
}

export function validateExerciseEditorInput(input: ExerciseEditorInput): string | null {
  return (
    validateFillBlankBoundaries(input) ??
    validateTypeSkillConsistency(input) ??
    validateAnswerCompleteness(input)
  );
}

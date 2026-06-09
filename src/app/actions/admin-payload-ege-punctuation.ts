import type { ExerciseEditorInput } from './admin-types';
import type { AdminExercisePayloadBase } from './admin-payload-types';

export function buildEge20PunctuationPayload(
  input: ExerciseEditorInput,
  base: AdminExercisePayloadBase,
) {
  const rawSlots = [
    ...new Set((input.ege20Slots ?? []).filter((slot) => Number.isInteger(slot) && slot > 0)),
  ].sort((left, right) => left - right);
  const slots = rawSlots.length >= 2 ? rawSlots : [1, 2];
  const slotSet = new Set(slots);
  const targetSet = [
    ...new Set(
      (input.ege20TargetSet ?? []).filter(
        (slot) => Number.isInteger(slot) && slot > 0 && slotSet.has(slot),
      ),
    ),
  ].sort((left, right) => left - right);
  const signature = targetSet.join('');

  return {
    ...base,
    payload: {
      textWithSlots: (input.ege20TextWithSlots ?? '').trim() || 'Текст (1) ... (2) ...',
      slots,
    },
    answer: {
      rawAnswerText: signature || '1',
      acceptedAnswers: signature ? [signature] : ['1'],
      targetSet: targetSet.length ? targetSet : [slots[0]],
    },
  };
}

export function buildEge21PunctuationPayload(
  input: ExerciseEditorInput,
  base: AdminExercisePayloadBase,
) {
  const rawSentences = (input.ege21Sentences ?? [])
    .filter(
      (sentence) =>
        Number.isInteger(sentence.index) &&
        sentence.index > 0 &&
        sentence.text.trim().length > 0,
    )
    .map((sentence) => ({ index: sentence.index, text: sentence.text.trim() }))
    .sort((left, right) => left.index - right.index);
  const sentences =
    rawSentences.length >= 2
      ? rawSentences
      : [
          { index: 1, text: 'Первое предложение.' },
          { index: 2, text: 'Второе предложение.' },
        ];
  const sentenceIndexSet = new Set(sentences.map((sentence) => sentence.index));
  const targetSet = [
    ...new Set(
      (input.ege21TargetSet ?? []).filter(
        (index) => Number.isInteger(index) && index > 0 && sentenceIndexSet.has(index),
      ),
    ),
  ].sort((left, right) => left - right);
  const signature = targetSet.join('');

  return {
    ...base,
    payload: {
      targetPunctuation: input.ege21TargetPunctuation ?? 'comma',
      sentences,
    },
    answer: {
      rawAnswerText: signature || '1',
      acceptedAnswers: signature ? [signature] : ['1'],
      targetSet: targetSet.length ? targetSet : [sentences[0].index],
    },
  };
}

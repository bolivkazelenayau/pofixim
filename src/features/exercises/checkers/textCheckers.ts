import type {
  DictationExercise,
  OrthographyRepairExercise,
  SubmittedAnswer,
} from '../schemas';
import type { CheckMistake } from '../types';
import { buildResult } from './checkResult';
import {
  diffTokens,
  normalizeDictationText,
  tokenizeDictationText,
} from './checkUtils';

type CheckerOptions = { streak?: number; usedHint?: boolean };

export function checkDictation(
  exercise: DictationExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'dictation' }>,
  options: CheckerOptions,
) {
  const expectedDisplayTokens = tokenizeDictationText(
    normalizeDictationText(exercise.answer.text, true),
    exercise.answer.ignorePunctuation,
  );
  const submittedDisplayTokens = tokenizeDictationText(
    normalizeDictationText(submittedAnswer.text, true),
    exercise.answer.ignorePunctuation,
  );
  const expectedTokens = expectedDisplayTokens.map((token) =>
    normalizeDictationText(token, exercise.answer.caseSensitive),
  );
  const submittedTokens = submittedDisplayTokens.map((token) =>
    normalizeDictationText(token, exercise.answer.caseSensitive),
  );
  const diff = diffTokens(
    expectedTokens,
    submittedTokens,
    expectedDisplayTokens,
    submittedDisplayTokens,
  );
  const mistakes = diff
    .filter((item) => item.kind !== 'equal')
    .map((item): CheckMistake => {
      if (item.kind === 'missing') {
        return {
          kind: 'missing_dictation_token',
          message: 'Expected token was omitted in the dictation.',
          target: item.expected,
        };
      }
      if (item.kind === 'extra') {
        return {
          kind: 'extra_dictation_token',
          message: 'Unexpected token was added in the dictation.',
          target: item.actual,
        };
      }
      return {
        kind: 'wrong_dictation_token',
        message: 'Submitted token does not match the dictated text.',
        target: `${item.expected}:${item.actual}`,
      };
    });

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect: mistakes.length === 0,
    normalizedAnswer: {
      ...submittedAnswer,
      text: normalizeDictationText(submittedAnswer.text, exercise.answer.caseSensitive),
      diff,
    },
    mistakes,
    options,
  });
}

export function checkOrthographyRepair(
  exercise: OrthographyRepairExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'orthography_repair' }>,
  options: CheckerOptions,
) {
  const normalize = (value: string) =>
    value.trim().replace(/\s+/g, ' ').toLowerCase();
  const expected = new Map(
    exercise.answer.repairs.map((repair) => [
      repair.targetId,
      normalize(repair.correct),
    ]),
  );
  const submitted = new Map(
    submittedAnswer.repairs.map((repair) => [
      repair.targetId,
      normalize(repair.value),
    ]),
  );

  const mistakes: CheckMistake[] = [];
  for (const [targetId, correct] of expected) {
    const actual = submitted.get(targetId);
    if (!actual) {
      mistakes.push({
        kind: 'missing_orthography_repair',
        message: 'Expected repair target was not fixed.',
        target: targetId,
      });
    } else if (actual !== correct) {
      mistakes.push({
        kind: 'wrong_orthography_repair',
        message: 'Repair value does not match expected spelling.',
        target: `${targetId}:${correct}`,
      });
    }
  }

  for (const targetId of submitted.keys()) {
    if (!expected.has(targetId)) {
      mistakes.push({
        kind: 'extra_orthography_repair',
        message: 'Unexpected repair target was submitted.',
        target: targetId,
      });
    }
  }

  const isCorrect = mistakes.length === 0;

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      repairs: [...submitted.entries()].map(([targetId, value]) => ({
        targetId,
        value,
      })),
      correctText: exercise.answer.correctText,
    },
    mistakes,
    options,
  });
}

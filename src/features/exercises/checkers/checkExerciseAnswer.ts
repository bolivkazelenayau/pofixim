import {
  exerciseSchema,
  type Exercise,
  submittedAnswerSchema,
  type SubmittedAnswer,
} from '../schemas';
import type { CheckResult } from '../types';
import {
  checkEgeMultiSelect,
  checkFillBlank,
  checkMultipleChoice,
  checkOrderFragments,
  checkWordBankCloze,
  checkWordSearch,
} from './basicCheckers';
import { buildResult } from './checkResult';
import {
  checkEge20ComplexSentencePunctuation,
  checkEge21PunctuationAnalysis,
  checkPunctuationConstructor,
  checkPunctuationInsert,
} from './punctuationCheckers';
import {
  checkDictation,
  checkOrthographyRepair,
} from './textCheckers';

export function checkExerciseAnswer(
  rawExercise: Exercise,
  rawSubmittedAnswer: unknown,
  options: { streak?: number; usedHint?: boolean } = {},
): CheckResult {
  const exercise = exerciseSchema.parse(rawExercise);
  const submittedAnswer = submittedAnswerSchema.parse(rawSubmittedAnswer);

  if (exercise.type !== submittedAnswer.type) {
    return buildResult({
      exercise,
      submittedAnswer,
      isCorrect: false,
      normalizedAnswer: submittedAnswer,
      mistakes: [
        {
          kind: 'answer_type_mismatch',
          message: 'Answer type does not match exercise type.',
        },
      ],
      options,
    });
  }

  switch (exercise.type) {
    case 'multiple_choice':
      if (submittedAnswer.type !== 'multiple_choice') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkMultipleChoice(exercise, submittedAnswer, options);
    case 'fill_blank':
      if (submittedAnswer.type !== 'fill_blank') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkFillBlank(exercise, submittedAnswer, options);
    case 'word_bank_cloze':
      if (submittedAnswer.type !== 'word_bank_cloze') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkWordBankCloze(exercise, submittedAnswer, options);
    case 'order_fragments':
      if (submittedAnswer.type !== 'order_fragments') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkOrderFragments(exercise, submittedAnswer, options);
    case 'word_search':
      if (submittedAnswer.type !== 'word_search') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkWordSearch(exercise, submittedAnswer, options);
    case 'dictation':
      if (submittedAnswer.type !== 'dictation') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkDictation(exercise, submittedAnswer, options);
    case 'orthography_repair':
      if (submittedAnswer.type !== 'orthography_repair') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkOrthographyRepair(exercise, submittedAnswer, options);
    case 'ege_multi_select':
      if (submittedAnswer.type !== 'ege_multi_select') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkEgeMultiSelect(exercise, submittedAnswer, options);
    case 'punctuation_insert':
      if (submittedAnswer.type !== 'punctuation_insert') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkPunctuationInsert(exercise, submittedAnswer, options);
    case 'punctuation_constructor':
      if (submittedAnswer.type !== 'punctuation_constructor') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkPunctuationConstructor(exercise, submittedAnswer, options);
    case 'ege21_punctuation_analysis':
      if (submittedAnswer.type !== 'ege21_punctuation_analysis') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkEge21PunctuationAnalysis(exercise, submittedAnswer, options);
    case 'ege20_complex_sentence_punctuation':
      if (submittedAnswer.type !== 'ege20_complex_sentence_punctuation') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkEge20ComplexSentencePunctuation(exercise, submittedAnswer, options);
  }
}

function buildTypeMismatchResult(
  exercise: Exercise,
  submittedAnswer: SubmittedAnswer,
  options: { streak?: number; usedHint?: boolean },
) {
  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect: false,
    normalizedAnswer: submittedAnswer,
    mistakes: [
      {
        kind: 'answer_type_mismatch',
        message: 'Answer type does not match exercise type.',
      },
    ],
    options,
  });
}

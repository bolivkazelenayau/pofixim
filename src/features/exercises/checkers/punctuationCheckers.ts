import type {
  Ege20ComplexSentencePunctuationExercise,
  Ege21PunctuationAnalysisExercise,
  PunctuationConstructorExercise,
  PunctuationInsertExercise,
  SubmittedAnswer,
} from '../schemas';
import { buildResult } from './checkResult';
import {
  buildConstructorMistakes,
  buildPunctuationMistakes,
  normalizeConstructorPlacements,
  normalizeIndexSet,
  normalizeMarks,
  parseEge21Set,
  renderConstructorSentence,
  serializeIndexSet,
  sortMarks,
} from './checkUtils';

type CheckerOptions = { streak?: number; usedHint?: boolean };

export function checkPunctuationInsert(
  exercise: PunctuationInsertExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'punctuation_insert' }>,
  options: CheckerOptions,
) {
  const expected = normalizeMarks(exercise.answer.marks);
  const submitted = normalizeMarks(submittedAnswer.marks);
  const isCorrect = expected === submitted;

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      marks: [...submittedAnswer.marks].sort(sortMarks),
    },
    mistakes: isCorrect
      ? []
      : buildPunctuationMistakes(exercise, submittedAnswer),
    options,
  });
}

export function checkPunctuationConstructor(
  exercise: PunctuationConstructorExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'punctuation_constructor' }>,
  options: CheckerOptions,
) {
  const expected = normalizeConstructorPlacements(exercise.answer.placements);
  const submitted = normalizeConstructorPlacements(submittedAnswer.placements);
  const isCorrect = expected === submitted;

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      rendered: renderConstructorSentence(
        exercise.payload.tokens,
        submittedAnswer.placements,
      ),
    },
    mistakes: isCorrect
      ? []
      : buildConstructorMistakes(exercise, submittedAnswer),
    options,
  });
}

export function checkEge21PunctuationAnalysis(
  exercise: Ege21PunctuationAnalysisExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'ege21_punctuation_analysis' }>,
  options: CheckerOptions,
) {
  const submittedSet = parseEge21Set(submittedAnswer.value);
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
      parsedSet: submittedSet,
      signature: submittedSignature,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_sentence_set',
            message: 'Submitted set of sentence numbers is not correct.',
            target: expectedSignature,
          },
        ],
    options,
  });
}

export function checkEge20ComplexSentencePunctuation(
  exercise: Ege20ComplexSentencePunctuationExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'ege20_complex_sentence_punctuation' }>,
  options: CheckerOptions,
) {
  const submittedSet = parseEge21Set(submittedAnswer.value);
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
      parsedSet: submittedSet,
      signature: submittedSignature,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_slot_set',
            message: 'Submitted set of punctuation slots is not correct.',
            target: expectedSignature,
          },
        ],
    options,
  });
}

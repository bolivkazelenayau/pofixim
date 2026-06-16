import type { Exercise, SubmittedAnswer } from '../schemas';
import { calculateScoreDelta } from '../scoring';
import type { CheckMistake, CheckResult } from '../types';
import { buildPedagogy } from './pedagogy';
import { extractStructuredFeedback } from './structuredFeedback';

export function buildResult({
  exercise,
  isCorrect,
  normalizedAnswer,
  mistakes,
  options,
}: {
  exercise: Exercise;
  submittedAnswer: SubmittedAnswer;
  isCorrect: boolean;
  normalizedAnswer: unknown;
  mistakes: CheckMistake[];
  options: { streak?: number; usedHint?: boolean };
}): CheckResult {
  const pedagogy = buildPedagogy(exercise, isCorrect, mistakes);
  const structuredFeedback = extractStructuredFeedback(exercise);

  return {
    isCorrect,
    scoreDelta: calculateScoreDelta({
      isCorrect,
      difficulty: exercise.difficulty,
      streak: options.streak,
      usedHint: options.usedHint,
    }),
    normalizedAnswer,
    mistakes,
    ...pedagogy,
    feedback: {
      short: isCorrect ? 'Correct' : 'Try again',
      explanation: exercise.explanation,
      correctAnswer: structuredFeedback?.correctAnswer,
      detailedExplanation: structuredFeedback?.detailedExplanation,
    },
  };
}

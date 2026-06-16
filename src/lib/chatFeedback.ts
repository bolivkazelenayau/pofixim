import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';
import { buildDictationFeedbackText } from '@/features/exercises/dictationFeedback';
import type { checkExerciseAnswer } from '@/features/exercises/checkers';

export function correctAnswerFeedbackPrefix() {
  return 'Верно. ';
}

export function buildFeedbackText(
  result: ReturnType<typeof checkExerciseAnswer> | undefined,
  exerciseType?: Exercise['type'],
) {
  if (!result) return '';
  if (exerciseType === 'dictation') {
    return result.isCorrect
      ? 'Верно.'
      : buildDictationFeedbackText(result.normalizedAnswer, result.feedback.explanation);
  }
  const prefix = result.isCorrect ? correctAnswerFeedbackPrefix() : '';
  const prefixText = prefix ? `${prefix}\n\n` : '';

  if (result.feedback.correctAnswer && result.feedback.detailedExplanation) {
    const correctAnswerLabel = 'Правильный ответ';
    const explanationLabel = 'Объяснение';
    return `${prefixText}${correctAnswerLabel}:\n${result.feedback.correctAnswer}\n\n${explanationLabel}:\n${result.feedback.detailedExplanation}`;
  }

  return `${prefixText}${result.feedback.explanation}`;
}

export function submittedAnswerFromText(exercise: Exercise, text: string): SubmittedAnswer | null {
  const value = text.trim();
  if (!value) return null;

  if (exercise.type === 'fill_blank') {
    return { type: 'fill_blank', value };
  }

  if (exercise.type === 'dictation') {
    return { type: 'dictation', text: value };
  }

  if (exercise.type === 'ege21_punctuation_analysis') {
    const numericValue = value.replace(/[^0-9]/g, '');
    return numericValue ? { type: 'ege21_punctuation_analysis', value: numericValue } : null;
  }

  if (exercise.type === 'ege20_complex_sentence_punctuation') {
    const numericValue = value.replace(/[^0-9]/g, '');
    return numericValue ? { type: 'ege20_complex_sentence_punctuation', value: numericValue } : null;
  }

  return null;
}

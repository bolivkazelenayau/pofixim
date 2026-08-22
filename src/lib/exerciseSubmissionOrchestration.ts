import type { Exercise } from '@/features/exercises/schemas';
import type {
  PendingExerciseSubmission,
  ExerciseSubmissionPayload,
} from '@/lib/exerciseSubmissionState';

type ExerciseMessageLike = {
  id: string;
  type: 'text' | 'question' | 'exercise';
  exercise?: Exercise;
  feedbackForExerciseMessageId?: string;
};

export type RetryableExerciseSubmission = {
  exerciseMessageId: string;
  exercise: Exercise & { id: number };
  submission: PendingExerciseSubmission & { payload: ExerciseSubmissionPayload };
};

/**
 * Finds an unresolved submission by its persisted exercise message, not by
 * the current tail message. Transport errors append a bot message and must
 * not make the original global-input exercise unreachable.
 */
export function findRetryableExerciseSubmission(
  pendingSubmissions: Record<string, PendingExerciseSubmission>,
  messages: ExerciseMessageLike[],
  sessionId?: string,
): RetryableExerciseSubmission | null {
  const answeredExerciseMessageIds = new Set(
    messages
      .map((message) => message.feedbackForExerciseMessageId)
      .filter((messageId): messageId is string => Boolean(messageId)),
  );

  return Object.entries(pendingSubmissions)
    .filter(([, submission]) => submission.status === 'uncertain')
    .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
    .map(([exerciseMessageId, submission]) => {
      const message = messages.find((candidate) => candidate.id === exerciseMessageId);
      const exercise = message?.exercise;
      if (
        !message ||
        message.type !== 'exercise' ||
        !exercise ||
        typeof exercise.id !== 'number' ||
        exercise.id !== submission.payload.exerciseId ||
        (sessionId && submission.payload.sessionId !== sessionId) ||
        answeredExerciseMessageIds.has(exerciseMessageId)
      ) {
        return null;
      }

      return {
        exerciseMessageId,
        exercise: exercise as Exercise & { id: number },
        submission,
      };
    })
    .find((candidate): candidate is RetryableExerciseSubmission => candidate !== null) ?? null;
}

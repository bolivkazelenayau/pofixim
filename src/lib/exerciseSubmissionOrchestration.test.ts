import assert from 'node:assert/strict';

import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';
import {
  normalizePendingExerciseSubmissions,
  reserveExerciseSubmission,
  setExerciseSubmissionStatus,
} from '@/lib/exerciseSubmissionState';
import { findRetryableExerciseSubmission } from '@/lib/exerciseSubmissionOrchestration';

export function runExerciseSubmissionOrchestrationRegressionTests() {
  const exerciseMessageId = 'exercise-global-input-1';
  const exercise = {
    id: 41,
    type: 'dictation',
  } as Exercise & { id: number };
  const submittedAnswer = {
    type: 'dictation',
    text: 'тестовый ответ',
  } as SubmittedAnswer;
  const payload = {
    sessionId: 'session-global-input',
    exerciseId: exercise.id,
    submittedAnswer,
  };
  const initialReservation = reserveExerciseSubmission(undefined, payload, {
    now: 10,
    createSubmissionId: () => 'submission-global-input-1',
  });
  assert.equal(initialReservation.kind, 'submit');
  if (initialReservation.kind !== 'submit') return;
  const uncertainSubmission = setExerciseSubmissionStatus(initialReservation.submission, 'uncertain', 20);
  const pending = { [exerciseMessageId]: uncertainSubmission };

  // The exercise is followed by the user answer and transport-error message;
  // the original exercise is no longer the literal last message.
  const messages = [
    { id: exerciseMessageId, type: 'exercise' as const, exercise },
    { id: 'answer-1', type: 'text' as const },
    { id: 'transport-error-1', type: 'text' as const },
  ];
  const retryable = findRetryableExerciseSubmission(pending, messages, payload.sessionId);
  assert.ok(retryable, 'global-input retry must remain reachable after transport error');
  if (!retryable) return;
  assert.equal(retryable.exerciseMessageId, exerciseMessageId);
  assert.equal(retryable.submission.submissionId, 'submission-global-input-1');
  assert.deepEqual(retryable.submission.payload, payload);

  const retryReservation = reserveExerciseSubmission(
    retryable.submission,
    retryable.submission.payload,
    { now: 30, createSubmissionId: () => { throw new Error('retry must not create a UUID'); } },
  );
  assert.equal(retryReservation.kind, 'submit');
  assert.equal(retryReservation.isRetry, true);
  assert.equal(retryReservation.submission.submissionId, 'submission-global-input-1');

  // Persisted pending state is the source for a reload-safe replay.
  const restoredPending = normalizePendingExerciseSubmissions(JSON.parse(JSON.stringify(pending)));
  const restoredRetryable = findRetryableExerciseSubmission(restoredPending, messages, payload.sessionId);
  assert.ok(restoredRetryable, 'reload must restore the global-input retry action');
  if (!restoredRetryable) return;
  assert.equal(restoredRetryable.submission.submissionId, 'submission-global-input-1');
  assert.deepEqual(restoredRetryable.submission.payload, payload);

  // Once feedback is present, the old card is no longer eligible for replay.
  const answeredMessages = [
    ...messages,
    {
      id: 'feedback-1',
      type: 'text' as const,
      feedbackForExerciseMessageId: exerciseMessageId,
    },
  ];
  assert.equal(findRetryableExerciseSubmission(pending, answeredMessages, payload.sessionId), null);
}

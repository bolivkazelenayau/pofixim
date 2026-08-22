import assert from 'node:assert/strict';

import {
  normalizePendingExerciseSubmissions,
  reserveExerciseSubmission,
  setExerciseSubmissionStatus,
  type ExerciseSubmissionPayload,
} from './exerciseSubmissionState';

export function runExerciseSubmissionStateRegressionTests() {
  const payload: ExerciseSubmissionPayload = {
    sessionId: 'session-1',
    exerciseId: 42,
    submittedAnswer: {
      type: 'multiple_choice',
      selectedOptionIndex: 1,
    },
  };
  const messageId = 'exercise-message-1';
  const first = reserveExerciseSubmission(undefined, payload, {
    now: 1,
    createSubmissionId: () => 'submission-1',
  });

  assert.equal(first.kind, 'submit');
  if (first.kind !== 'submit') return;

  const uncertain = setExerciseSubmissionStatus(first.submission, 'uncertain', 2);
  const replay = reserveExerciseSubmission(uncertain, payload, {
    now: 3,
    createSubmissionId: () => 'submission-2',
  });
  assert.equal(replay.kind, 'submit');
  if (replay.kind !== 'submit') return;
  assert.equal(replay.isRetry, true);
  assert.equal(replay.submission.submissionId, 'submission-1');

  let generatedForBlockedPayload = false;
  const blocked = reserveExerciseSubmission(
    uncertain,
    { ...payload, submittedAnswer: { type: 'multiple_choice', selectedOptionIndex: 0 } },
    {
      createSubmissionId: () => {
        generatedForBlockedPayload = true;
        return 'submission-3';
      },
    },
  );
  assert.deepEqual(blocked, {
    kind: 'blocked',
    reason: 'uncertain-payload',
    message: 'Предыдущая отправка ещё не подтверждена. Повторите исходный ответ или разрешите его статус.',
  });
  assert.equal(generatedForBlockedPayload, false);

  const restored = normalizePendingExerciseSubmissions(
    JSON.parse(JSON.stringify({ [messageId]: first.submission })),
  );
  assert.equal(restored[messageId].status, 'uncertain');
  const replayAfterReload = reserveExerciseSubmission(restored[messageId], payload, {
    createSubmissionId: () => 'submission-after-reload',
  });
  assert.equal(replayAfterReload.kind, 'submit');
  if (replayAfterReload.kind !== 'submit') return;
  assert.equal(replayAfterReload.submission.submissionId, 'submission-1');

  const applied = setExerciseSubmissionStatus(uncertain, 'applied', 4);
  const duplicateSuccess = reserveExerciseSubmission(applied, payload, {
    createSubmissionId: () => 'submission-4',
  });
  assert.deepEqual(duplicateSuccess, {
    kind: 'blocked',
    reason: 'applied',
    message: 'Этот ответ уже сохранён.',
  });

  const failed = setExerciseSubmissionStatus(first.submission, 'failed', 5);
  const nextAttempt = reserveExerciseSubmission(failed, payload, {
    createSubmissionId: () => 'submission-5',
  });
  assert.equal(nextAttempt.kind, 'submit');
  if (nextAttempt.kind !== 'submit') return;
  assert.equal(nextAttempt.isRetry, false);
  assert.equal(nextAttempt.submission.submissionId, 'submission-5');
}

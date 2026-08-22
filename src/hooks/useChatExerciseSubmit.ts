import { useCallback, useEffect, useMemo, useRef } from 'react';

import { submitExerciseAnswerAction } from '@/app/actions/exercises';
import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';
import { buildFeedbackText } from '@/lib/chatFeedback';
import {
  reserveExerciseSubmission,
  setExerciseSubmissionStatus,
  type ExerciseSubmissionPayload,
} from '@/lib/exerciseSubmissionState';
import { findRetryableExerciseSubmission } from '@/lib/exerciseSubmissionOrchestration';
import { createMessageId } from '@/lib/message-id';
import { useChatStore, type Message } from '@/store/chatStore';

const NEXT_EXERCISE_DELAY_MS = 800;

type UseChatExerciseSubmitOptions = {
  sessionId: string | undefined;
  cooldownExerciseIds: number[];
  seenExerciseIds: number[];
  messages: Message[];
  addMessage: (message: Message) => void;
  setTyping: (isTyping: boolean) => void;
  recordExerciseResult: (input: {
    exerciseId: number;
    isCorrect: boolean;
    scoreDelta: number;
    streak: number;
  }) => void;
  markExercisePresented: (exerciseId: number) => void;
  fetchNextExercise: (currentSeenIds: number[]) => void;
};

export function useChatExerciseSubmit({
  sessionId,
  cooldownExerciseIds,
  seenExerciseIds,
  messages,
  addMessage,
  setTyping,
  recordExerciseResult,
  markExercisePresented,
  fetchNextExercise,
}: UseChatExerciseSubmitOptions) {
  const nextExerciseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingExerciseSubmissions = useChatStore((state) => state.pendingExerciseSubmissions);

  const clearNextExerciseTimer = useCallback(() => {
    if (!nextExerciseTimerRef.current) return;
    clearTimeout(nextExerciseTimerRef.current);
    nextExerciseTimerRef.current = null;
  }, []);

  useEffect(() => clearNextExerciseTimer, [clearNextExerciseTimer]);

  const handleExerciseSubmit = useCallback(
    async (
      exercise: Exercise & { id: number },
      submittedAnswer: SubmittedAnswer,
      answerLabel: string,
      exerciseMessageId?: string,
    ) => {
      if (!sessionId) {
        addMessage({
          id: createMessageId('session-missing'),
          isBot: true,
          content: 'Сессия ещё инициализируется. Попробуйте через секунду.',
          type: 'text',
        });
        return;
      }

      const pendingKey = exerciseMessageId ?? `exercise:${exercise.id}`;
      const payload: ExerciseSubmissionPayload = {
        exerciseId: exercise.id,
        sessionId,
        submittedAnswer,
      };
      const currentState = useChatStore.getState();
      const reservation = reserveExerciseSubmission(
        currentState.pendingExerciseSubmissions[pendingKey],
        payload,
      );

      if (reservation.kind === 'blocked') {
        if (reservation.reason === 'uncertain-payload') {
          addMessage({
            id: createMessageId('submit-pending'),
            isBot: true,
            content: reservation.message,
            type: 'text',
          });
        }
        return;
      }

      const submission = reservation.submission;
      currentState.setPendingExerciseSubmission(pendingKey, submission);

      if (!reservation.isRetry) {
        addMessage({
          id: createMessageId('answer'),
          isBot: false,
          content: answerLabel,
          type: 'text',
        });
      }

      setTyping(true);

      let res: Awaited<ReturnType<typeof submitExerciseAnswerAction>>;
      try {
        res = await submitExerciseAnswerAction({
          sessionId: submission.payload.sessionId,
          submissionId: submission.submissionId,
          exerciseId: submission.payload.exerciseId,
          submittedAnswer: submission.payload.submittedAnswer,
          returnNextExercise: true,
          seenExerciseIds: [...new Set([...cooldownExerciseIds, ...seenExerciseIds, exercise.id])],
        });
      } catch {
        useChatStore.getState().setPendingExerciseSubmission(
          pendingKey,
          setExerciseSubmissionStatus(submission, 'uncertain'),
        );
        setTyping(false);
        addMessage({
          id: createMessageId('submit-error'),
          isBot: true,
          content: 'Ответ не удалось сохранить. Попробуйте ещё раз.',
          type: 'text',
        });
        return;
      }

      setTyping(false);

      if (!res.success || !res.result) {
        useChatStore.getState().setPendingExerciseSubmission(
          pendingKey,
          setExerciseSubmissionStatus(submission, 'failed'),
        );
        addMessage({
          id: createMessageId('submit-error'),
          isBot: true,
          content:
            'Ответ не удалось проверить. Скорее всего, задание есть в UI, но не найдено в таблице exercises.',
          type: 'text',
        });
        return;
      }

      useChatStore.getState().setPendingExerciseSubmission(
        pendingKey,
        setExerciseSubmissionStatus(submission, 'applied'),
      );

      recordExerciseResult({
        exerciseId: exercise.id,
        isCorrect: res.result.isCorrect,
        scoreDelta: res.result.scoreDelta,
        streak: res.session?.currentStreak ?? 0,
      });

      addMessage({
        id: createMessageId('feedback'),
        isBot: true,
        content: buildFeedbackText(res.result, exercise.type),
        type: 'text',
        feedbackForExerciseId: exercise.id,
        feedbackForExerciseMessageId: exerciseMessageId,
        submittedAnswer,
        seedKey: exercise.seedKey ?? undefined,
      });

      setTyping(true);
      clearNextExerciseTimer();
      nextExerciseTimerRef.current = setTimeout(() => {
        nextExerciseTimerRef.current = null;
        setTyping(false);
        if ('nextExercise' in res && res.nextExercise?.id) {
          markExercisePresented(res.nextExercise.id);
          addMessage({
            id: createMessageId('exercise'),
            isBot: true,
            content: res.nextExercise.prompt,
            type: 'exercise',
            exercise: res.nextExercise,
          });
          return;
        }
        if ('noMoreExercises' in res && res.noMoreExercises) {
          addMessage({
            id: createMessageId('end'),
            isBot: true,
            content:
              'Доступные упражнения закончились. Добавьте новые в админке или сбросьте прогресс.',
            type: 'text',
          });
          return;
        }
        fetchNextExercise([...seenExerciseIds, exercise.id]);
      }, NEXT_EXERCISE_DELAY_MS);
    },
    [
      addMessage,
      clearNextExerciseTimer,
      cooldownExerciseIds,
      fetchNextExercise,
      markExercisePresented,
      recordExerciseResult,
      seenExerciseIds,
      sessionId,
      setTyping,
    ],
  );

  const retryableExerciseSubmission = useMemo(
    () => findRetryableExerciseSubmission(pendingExerciseSubmissions, messages, sessionId),
    [messages, pendingExerciseSubmissions, sessionId],
  );

  const retryPendingExerciseSubmission = useCallback(() => {
    const currentRetryableSubmission = findRetryableExerciseSubmission(
      useChatStore.getState().pendingExerciseSubmissions,
      messages,
      sessionId,
    );
    if (!currentRetryableSubmission) return false;

    void handleExerciseSubmit(
      currentRetryableSubmission.exercise,
      currentRetryableSubmission.submission.payload.submittedAnswer,
      '',
      currentRetryableSubmission.exerciseMessageId,
    );
    return true;
  }, [handleExerciseSubmit, messages, sessionId]);

  return {
    handleExerciseSubmit,
    clearPendingNextExercise: clearNextExerciseTimer,
    hasRetryablePendingSubmission: Boolean(retryableExerciseSubmission),
    retryPendingExerciseSubmission,
  };
}

import { useCallback, useEffect, useRef } from 'react';

import { submitExerciseAnswerAction } from '@/app/actions/exercises';
import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';
import { buildFeedbackText } from '@/lib/chatFeedback';
import { createMessageId } from '@/lib/message-id';
import type { Message } from '@/store/chatStore';

const NEXT_EXERCISE_DELAY_MS = 800;

type UseChatExerciseSubmitOptions = {
  sessionId: string | undefined;
  cooldownExerciseIds: number[];
  seenExerciseIds: number[];
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
  addMessage,
  setTyping,
  recordExerciseResult,
  markExercisePresented,
  fetchNextExercise,
}: UseChatExerciseSubmitOptions) {
  const nextExerciseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      addMessage({
        id: createMessageId('answer'),
        isBot: false,
        content: answerLabel,
        type: 'text',
      });

      setTyping(true);

      const res = await submitExerciseAnswerAction({
        sessionId,
        exerciseId: exercise.id,
        submittedAnswer,
        returnNextExercise: true,
        seenExerciseIds: [...new Set([...cooldownExerciseIds, ...seenExerciseIds, exercise.id])],
      });

      setTyping(false);

      if (!res.success || !res.result) {
        addMessage({
          id: createMessageId('submit-error'),
          isBot: true,
          content:
            'Ответ не удалось проверить. Скорее всего, задание есть в UI, но не найдено в таблице exercises.',
          type: 'text',
        });
        return;
      }

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

  return { handleExerciseSubmit, clearPendingNextExercise: clearNextExerciseTimer };
}

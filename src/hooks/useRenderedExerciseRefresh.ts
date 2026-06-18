import { useCallback, useEffect, useRef } from 'react';
import {
  getExerciseVersionsByIdsAction,
  getExercisesByIdsAction,
} from '@/app/actions/exercises';
import { checkExerciseAnswer } from '@/features/exercises/checkers';
import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';
import type { ExerciseUpdatedEvent } from '@/lib/exercise-update-event-schema';
import { subscribeToExerciseUpdates } from '@/lib/exercise-update-events';
import { buildFeedbackText, submittedAnswerFromText } from '@/lib/chatFeedback';
import type { Message } from '@/store/chatStore';

type ExerciseMessage = Message & {
  type: 'exercise';
  exercise: Exercise & { id: number };
};

type UseRenderedExerciseRefreshOptions = {
  messages: Message[];
  hasHydrated: boolean;
  pollMs: number;
  updateExerciseMessages: (exercises: Array<Exercise & { id: number }>) => void;
  updateFeedbackMessages: (feedbacks: Array<{
    messageId?: string;
    exerciseId?: number;
    content: string;
    submittedAnswer?: SubmittedAnswer;
    seedKey?: string;
  }>) => void;
};

export function isExerciseMessage(message: Message): message is ExerciseMessage {
  return (
    message.type === 'exercise' &&
    Boolean(message.exercise) &&
    typeof message.exercise?.id === 'number'
  );
}

function isNewerVersion(nextUpdatedAt: string, previousUpdatedAt: string | undefined) {
  if (!previousUpdatedAt) return true;
  const nextTime = Date.parse(nextUpdatedAt);
  const previousTime = Date.parse(previousUpdatedAt);
  if (Number.isFinite(nextTime) && Number.isFinite(previousTime)) {
    return nextTime > previousTime;
  }
  return nextUpdatedAt > previousUpdatedAt;
}

export function useRenderedExerciseRefresh({
  messages,
  hasHydrated,
  pollMs,
  updateExerciseMessages,
  updateFeedbackMessages,
}: UseRenderedExerciseRefreshOptions) {
  const isPollingExerciseVersionsRef = useRef(false);
  const isRefreshingExercisesRef = useRef(false);
  const exerciseVersionByIdRef = useRef<Map<number, string>>(new Map());

  const refreshRenderedExercises = useCallback(async (targetExerciseIds?: number[]) => {
    if (isRefreshingExercisesRef.current) return;
    const targetExerciseIdSet = targetExerciseIds?.length ? new Set(targetExerciseIds) : null;
    const exerciseIds = messages
      .filter(isExerciseMessage)
      .map((message) => message.exercise.id)
      .filter((exerciseId) => !targetExerciseIdSet || targetExerciseIdSet.has(exerciseId));
    if (exerciseIds.length === 0) return;

    isRefreshingExercisesRef.current = true;
    try {
      const res = await getExercisesByIdsAction({ exerciseIds });
      if (!res.success) return;

      const freshExercises = (res.exercises ?? []).filter(
        (exercise): exercise is Exercise & { id: number } =>
          typeof exercise.id === 'number',
      );
      updateExerciseMessages(freshExercises);
      exerciseVersionByIdRef.current = new Map([
        ...exerciseVersionByIdRef.current,
        ...freshExercises
          .filter((exercise) => exercise.updatedAt)
          .map((exercise) => [exercise.id, exercise.updatedAt!] as const),
      ]);

      const freshById = new Map(freshExercises.map((exercise) => [exercise.id, exercise]));
      const feedbacks: Array<{ messageId?: string; exerciseId?: number; content: string; seedKey?: string }> = [];
      let currentExercise: (Exercise & { id: number }) | null = null;
      let latestSubmittedAnswer:
        | { exercise: Exercise & { id: number }; submittedAnswer: SubmittedAnswer }
        | null = null;

      for (const message of messages) {
        if (isExerciseMessage(message)) {
          currentExercise = freshById.get(message.exercise.id) ?? message.exercise;
          latestSubmittedAnswer = null;
          continue;
        }

        if (!message.isBot && message.type === 'text' && currentExercise) {
          const submittedAnswer = submittedAnswerFromText(currentExercise, message.content);
          latestSubmittedAnswer = submittedAnswer
            ? { exercise: currentExercise, submittedAnswer }
            : null;
          continue;
        }

        if (message.isBot && message.type === 'text') {
          const explicitExercise = message.feedbackForExerciseId
            ? freshById.get(message.feedbackForExerciseId)
            : undefined;
          const explicitAnswer = message.submittedAnswer;
          const inferred = latestSubmittedAnswer;
          const exercise = explicitExercise ?? inferred?.exercise;
          const submittedAnswer = explicitAnswer ?? inferred?.submittedAnswer;

          if (exercise && submittedAnswer) {
            try {
              const result = checkExerciseAnswer(exercise, submittedAnswer, { streak: 0 });
              feedbacks.push({
                messageId: message.id,
                exerciseId: exercise.id,
                content: buildFeedbackText(result, exercise.type),
                seedKey: exercise.seedKey ?? undefined,
              });
            } catch {
              // Older or malformed local messages should not break live exercise refresh.
            }
          }

          latestSubmittedAnswer = null;
        }
      }
      updateFeedbackMessages(feedbacks);
    } finally {
      isRefreshingExercisesRef.current = false;
    }
  }, [messages, updateExerciseMessages, updateFeedbackMessages]);

  const pollRenderedExerciseVersions = useCallback(async () => {
    if (isPollingExerciseVersionsRef.current) return;

    const exerciseIds = [
      ...new Set(messages.filter(isExerciseMessage).map((message) => message.exercise.id)),
    ];
    if (exerciseIds.length === 0) return;

    isPollingExerciseVersionsRef.current = true;
    try {
      const res = await getExerciseVersionsByIdsAction({ exerciseIds });
      if (!res.success) return;

      const changedExerciseIds: number[] = [];
      const nextVersions = new Map(exerciseVersionByIdRef.current);

      for (const version of res.versions ?? []) {
        const previousVersion = exerciseVersionByIdRef.current.get(version.id);
        nextVersions.set(version.id, version.updatedAt);

        if (previousVersion && previousVersion !== version.updatedAt) {
          changedExerciseIds.push(version.id);
        }
      }

      exerciseVersionByIdRef.current = nextVersions;

      if (changedExerciseIds.length > 0) {
        void refreshRenderedExercises(changedExerciseIds);
      }
    } finally {
      isPollingExerciseVersionsRef.current = false;
    }
  }, [messages, refreshRenderedExercises]);

  const handleExerciseUpdated = useCallback((event: ExerciseUpdatedEvent) => {
    const exerciseId = event.exerciseId;
    const isRendered = messages.some(
      (message) => isExerciseMessage(message) && message.exercise.id === exerciseId,
    );
    if (!isRendered) return;

    const knownVersion = exerciseVersionByIdRef.current.get(exerciseId);
    if (!isNewerVersion(event.updatedAt, knownVersion)) return;

    void refreshRenderedExercises([exerciseId]);
  }, [messages, refreshRenderedExercises]);

  useEffect(() => {
    if (!hasHydrated) return;

    exerciseVersionByIdRef.current = new Map(
      messages
        .filter(isExerciseMessage)
        .filter((message) => message.exercise.updatedAt)
        .map((message) => [message.exercise.id, message.exercise.updatedAt!] as const),
    );

    void refreshRenderedExercises();
    void pollRenderedExerciseVersions();

    const unsubscribeFromExerciseUpdates = subscribeToExerciseUpdates(handleExerciseUpdated);
    const pollTimer = window.setInterval(
      () => void pollRenderedExerciseVersions(),
      pollMs,
    );

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') {
        void refreshRenderedExercises();
        void pollRenderedExerciseVersions();
      }
    }

    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      unsubscribeFromExerciseUpdates();
      window.clearInterval(pollTimer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [handleExerciseUpdated, hasHydrated, messages, pollMs, pollRenderedExerciseVersions, refreshRenderedExercises]);

  return { refreshRenderedExercises };
}

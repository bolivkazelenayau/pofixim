import { useCallback, useEffect, useRef } from 'react';

import type { Message } from '@/store/chatStore';

const DEFAULT_INITIAL_EXERCISE_DELAY_MS = 700;

type UseInitialExerciseRequestOptions = {
  hasHydrated: boolean;
  messages: Message[];
  hasRequestedInitialExercise: boolean;
  seenExerciseIds: number[];
  markInitialExerciseRequested: () => void;
  setTyping: (isTyping: boolean) => void;
  fetchNextExercise: (currentSeenIds: number[]) => void;
  delayMs?: number;
};

function isWelcomeMessage(message: Message | undefined) {
  return (
    message?.type === 'text' &&
    (message.id === 'welcome' || message.id.endsWith('-welcome'))
  );
}

export function useInitialExerciseRequest({
  hasHydrated,
  messages,
  hasRequestedInitialExercise,
  seenExerciseIds,
  markInitialExerciseRequested,
  setTyping,
  fetchNextExercise,
  delayMs = DEFAULT_INITIAL_EXERCISE_DELAY_MS,
}: UseInitialExerciseRequestOptions) {
  const initializedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearInitialExerciseTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const resetInitialExerciseRequest = useCallback(() => {
    initializedRef.current = false;
    clearInitialExerciseTimer();
  }, [clearInitialExerciseTimer]);

  useEffect(() => {
    return clearInitialExerciseTimer;
  }, [clearInitialExerciseTimer]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (
      messages.length === 1 &&
      isWelcomeMessage(messages[0]) &&
      !initializedRef.current &&
      !hasRequestedInitialExercise
    ) {
      initializedRef.current = true;
      markInitialExerciseRequested();
      setTyping(true);
      clearInitialExerciseTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setTyping(false);
        fetchNextExercise(seenExerciseIds);
      }, delayMs);
    }
  }, [
    clearInitialExerciseTimer,
    delayMs,
    fetchNextExercise,
    hasHydrated,
    hasRequestedInitialExercise,
    markInitialExerciseRequested,
    messages,
    seenExerciseIds,
    setTyping,
  ]);

  return { resetInitialExerciseRequest };
}

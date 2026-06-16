import { useCallback, useEffect, useRef, useState } from 'react';

import { normalizeSeedKeyInput } from '@/lib/chatCommands';
import type { Message } from '@/store/chatStore';
import { isExerciseMessage } from './useRenderedExerciseRefresh';

const DEFAULT_EXERCISE_HIGHLIGHT_MS = 900;

type UseExerciseMessageHighlightOptions = {
  messages: Message[];
  durationMs?: number;
};

export function useExerciseMessageHighlight({
  messages,
  durationMs = DEFAULT_EXERCISE_HIGHLIGHT_MS,
}: UseExerciseMessageHighlightOptions) {
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedExerciseMessageId, setHighlightedExerciseMessageId] = useState<string | null>(
    null,
  );

  const clearExerciseHighlight = useCallback(() => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    setHighlightedExerciseMessageId(null);
  }, []);

  const highlightLatestExerciseIfSameSeed = useCallback(
    (rawSeedKey: string) => {
      const seedKey = normalizeSeedKeyInput(rawSeedKey);
      const latestExerciseMessage = [...messages].reverse().find(isExerciseMessage);

      if (!latestExerciseMessage || latestExerciseMessage.exercise.seedKey !== seedKey) {
        return false;
      }

      clearExerciseHighlight();
      requestAnimationFrame(() => {
        setHighlightedExerciseMessageId(latestExerciseMessage.id);
        const element = document.querySelector<HTMLElement>(
          `[data-exercise-message-id="${latestExerciseMessage.id}"]`,
        );
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      highlightTimerRef.current = setTimeout(() => {
        setHighlightedExerciseMessageId((current) =>
          current === latestExerciseMessage.id ? null : current,
        );
        highlightTimerRef.current = null;
      }, durationMs);

      return true;
    },
    [clearExerciseHighlight, durationMs, messages],
  );

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, []);

  return {
    highlightedExerciseMessageId,
    highlightLatestExerciseIfSameSeed,
    clearExerciseHighlight,
  };
}

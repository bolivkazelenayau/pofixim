import { useEffect, useRef } from 'react';

type QuickGameState = {
  isOpen: boolean;
};

type BlitzState = QuickGameState & {
  isLoading: boolean;
  open: () => void | Promise<void>;
};

type UseAutoBlitzPromptOptions = {
  hasHydrated: boolean;
  streak: number;
  blitz: BlitzState;
  ege13Quick: QuickGameState;
  ege15Quick: QuickGameState;
};

const AUTO_BLITZ_STREAK_STEP = 5;

export function useAutoBlitzPrompt({
  hasHydrated,
  streak,
  blitz,
  ege13Quick,
  ege15Quick,
}: UseAutoBlitzPromptOptions) {
  const lastBlitzStreak = useRef(0);

  useEffect(() => {
    if (
      !hasHydrated ||
      blitz.isOpen ||
      ege13Quick.isOpen ||
      ege15Quick.isOpen ||
      blitz.isLoading
    ) {
      return;
    }

    if (streak < AUTO_BLITZ_STREAK_STEP || streak < lastBlitzStreak.current + AUTO_BLITZ_STREAK_STEP) {
      return;
    }

    lastBlitzStreak.current = streak;
    void blitz.open();
  }, [
    hasHydrated,
    blitz,
    blitz.isOpen,
    blitz.isLoading,
    ege13Quick.isOpen,
    ege15Quick.isOpen,
    streak,
  ]);
}

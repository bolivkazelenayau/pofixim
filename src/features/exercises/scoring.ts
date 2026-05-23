import type { ExerciseDifficulty } from './types';

type ScoreInput = {
  isCorrect: boolean;
  difficulty: ExerciseDifficulty;
  streak?: number;
  usedHint?: boolean;
};

export function calculateScoreDelta({
  isCorrect,
  difficulty,
  streak = 0,
  usedHint = false,
}: ScoreInput) {
  if (!isCorrect) {
    return 0;
  }

  const base = 10 * difficulty;
  const streakBonus = streak >= 3 ? 5 : 0;
  const hintPenalty = usedHint ? 4 : 0;

  return Math.max(1, base + streakBonus - hintPenalty);
}

export function ratingDeltaForAttempt({
  isCorrect,
  difficulty,
  streak = 0,
}: Omit<ScoreInput, 'usedHint'>) {
  if (!isCorrect) {
    return difficulty === 1 ? -8 : -6;
  }

  const difficultyBonus = difficulty === 2 ? 4 : 0;
  const streakBonus = streak >= 3 ? 3 : 0;

  return 12 + difficultyBonus + streakBonus;
}

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
    return -5;
  }

  const base = 10;
  // +30 bonus every 10th correct answer in a row
  const streakBonus = (streak > 0 && streak % 10 === 0) ? 30 : 0;
  const hintPenalty = usedHint ? 2 : 0;

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

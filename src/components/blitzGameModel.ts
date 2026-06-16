export type BlitzDuration = 30 | 60 | 120;

export type BlitzResult = {
  duration: BlitzDuration;
  correctCount: number;
  wrongCount: number;
  bestCombo: number;
  scoreDelta: number;
};

export const BLITZ_DURATIONS: BlitzDuration[] = [30, 60, 120];

const BASE_POINTS = 10;

export function scoreForBlitzAnswer(combo: number) {
  // +30 bonus every 10th correct answer in a row
  const streakBonus = (combo > 0 && combo % 10 === 0) ? 30 : 0;
  return BASE_POINTS + streakBonus;
}

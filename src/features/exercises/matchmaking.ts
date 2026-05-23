import type { Exercise, SubmittedAnswer } from './schemas';
import type { ExerciseDifficulty, ExerciseType } from './types';

export const SUPPORTED_EXERCISE_TYPES = [
  'multiple_choice',
  'ege_multi_select',
  'fill_blank',
  'word_bank_cloze',
  'word_search',
  'order_fragments',
  'punctuation_insert',
  'ege20_complex_sentence_punctuation',
  'ege21_punctuation_analysis',
] as const satisfies ExerciseType[];

const EXERCISE_TYPE_CYCLE = [
  'multiple_choice',
  'ege_multi_select',
  'fill_blank',
  'word_bank_cloze',
  'word_search',
  'order_fragments',
  'punctuation_insert',
  'ege20_complex_sentence_punctuation',
  'ege21_punctuation_analysis',
] as const satisfies ExerciseType[];

type SessionMatchState = {
  id: string;
  currentRating: number;
  currentStreak: number;
  completedCount: number;
  lastExerciseType?: ExerciseType | null;
};

type AttemptSnapshot = {
  exerciseId: number;
  exerciseType: ExerciseType;
  isCorrect: boolean;
};

export function ratingToDifficulty(rating: number): ExerciseDifficulty {
  return rating >= 1050 ? 2 : 1;
}

export function targetDifficultyForSession(
  session: SessionMatchState,
): ExerciseDifficulty {
  const baseDifficulty = ratingToDifficulty(session.currentRating);

  if (session.currentStreak >= 3) {
    return 2;
  }

  return baseDifficulty;
}

export function nextExerciseType(
  lastExerciseType?: ExerciseType | null,
  sessionId?: string,
  completedCount = 0,
  allowedTypes?: readonly ExerciseType[],
): (typeof SUPPORTED_EXERCISE_TYPES)[number] {
  const cycle = (allowedTypes?.length
    ? EXERCISE_TYPE_CYCLE.filter((t) => allowedTypes.includes(t))
    : EXERCISE_TYPE_CYCLE) as readonly (typeof SUPPORTED_EXERCISE_TYPES)[number][];

  const safeCycle = cycle.length ? cycle : EXERCISE_TYPE_CYCLE;

  if (!lastExerciseType) {
    // Round-robin start point: different sessions start from different offsets.
    // This prevents "same first question every time" behavior for fresh sessions.
    const start = sessionId ? hashString(sessionId) % safeCycle.length : 0;
    return safeCycle[(start + Math.max(0, completedCount)) % safeCycle.length];
  }

  const currentIndex = safeCycle.indexOf(
    lastExerciseType as (typeof safeCycle)[number],
  );

  if (currentIndex === -1) {
    return safeCycle[0];
  }

  return safeCycle[(currentIndex + 1) % safeCycle.length];
}

export function selectBestExerciseCandidate({
  candidates,
  session,
  recentAttempts,
}: {
  candidates: Exercise[];
  session: SessionMatchState;
  recentAttempts: AttemptSnapshot[];
}) {
  const targetDifficulty = targetDifficultyForSession(session);
  const availableTypes = [...new Set(candidates.map((c) => c.type))] as ExerciseType[];
  const targetType = nextExerciseType(
    session.lastExerciseType,
    session.id,
    session.completedCount,
    availableTypes,
  );
  const recentExerciseIds = new Set(recentAttempts.map((attempt) => attempt.exerciseId));
  const weakSkillTags = weakSkillsFromAttempts(candidates, recentAttempts);
  const recentTypeStats = recentTypeStatsFromAttempts(recentAttempts);

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: candidateScore({
        candidate,
        targetDifficulty,
        targetType,
        recentExerciseIds,
        weakSkillTags,
        sessionId: session.id,
        attemptIndex: recentAttempts.length,
        recentTypeStats,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return undefined;

  // Controlled randomness among the strongest candidates:
  // prevents repetitive first/early exercises while preserving quality bias.
  const explorationWindow =
    session.completedCount < 4 ? 18 : session.completedCount < 10 ? 10 : 5;
  const top = scored.slice(0, Math.min(explorationWindow, scored.length));
  const minScore = Math.min(...top.map((x) => x.score));
  const weighted = top.map((x) => ({
    candidate: x.candidate,
    // Flatter weights on fresh sessions => more diversity after reset.
    weight:
      session.completedCount < 4
        ? Math.max(1, Math.round((x.score - minScore) * 4) + 1)
        : Math.max(1, Math.round((x.score - minScore) * 10) + 1),
  }));

  const totalWeight = weighted.reduce((sum, x) => sum + x.weight, 0);
  let roll = Math.floor(Math.random() * totalWeight);
  for (const item of weighted) {
    if (roll < item.weight) return item.candidate;
    roll -= item.weight;
  }

  return weighted[0]?.candidate;
}

function candidateScore({
  candidate,
  targetDifficulty,
  targetType,
  recentExerciseIds,
  weakSkillTags,
  sessionId,
  attemptIndex,
  recentTypeStats,
}: {
  candidate: Exercise;
  targetDifficulty: ExerciseDifficulty;
  targetType: ExerciseType;
  recentExerciseIds: Set<number>;
  weakSkillTags: Set<string>;
  sessionId: string;
  attemptIndex: number;
  recentTypeStats: Map<ExerciseType, number>;
}) {
  const difficultyFit = 50 - Math.abs(candidate.difficulty - targetDifficulty) * 12;
  const typeVarietyBonus = candidate.type === targetType ? 18 : 0;
  const freshnessBonus = candidate.id && !recentExerciseIds.has(candidate.id) ? 12 : 0;
  const recentlySeenPenalty = candidate.id && recentExerciseIds.has(candidate.id) ? 50 : 0;
  const skillNeedBonus = candidate.skillTags.some((tag) => weakSkillTags.has(tag)) ? 10 : 0;
  const recentTypePenalty = (recentTypeStats.get(candidate.type) ?? 0) * 6;
  // Small deterministic noise to break ties between near-identical candidates.
  // Keeps behavior stable per session while removing repetitive fixed starts.
  const noiseSeed = `${sessionId}:${candidate.seedKey}:${attemptIndex}`;
  const tieBreakNoise = (hashString(noiseSeed) % 1000) / 1000;

  return (
    difficultyFit +
    typeVarietyBonus +
    freshnessBonus +
    skillNeedBonus -
    recentlySeenPenalty -
    recentTypePenalty +
    tieBreakNoise
  );
}

function weakSkillsFromAttempts(
  candidates: Exercise[],
  recentAttempts: AttemptSnapshot[],
) {
  const failedExerciseTypes = new Set(
    recentAttempts
      .filter((attempt) => !attempt.isCorrect)
      .map((attempt) => attempt.exerciseType),
  );

  return new Set(
    candidates
      .filter((candidate) => failedExerciseTypes.has(candidate.type))
      .flatMap((candidate) => candidate.skillTags),
  );
}

function recentTypeStatsFromAttempts(recentAttempts: AttemptSnapshot[]) {
  const map = new Map<ExerciseType, number>();
  // More weight for the latest answers.
  recentAttempts.slice(0, 8).forEach((attempt, idx) => {
    const weight = Math.max(1, 8 - idx);
    map.set(attempt.exerciseType, (map.get(attempt.exerciseType) ?? 0) + weight);
  });
  return map;
}

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function submittedAnswerType(answer: SubmittedAnswer) {
  return answer.type;
}

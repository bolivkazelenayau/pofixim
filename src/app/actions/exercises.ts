'use server';

import { db } from '@/db';
import {
  exerciseAttempts,
  exercises,
  learningSessions,
} from '@/db/schema';
import { checkExerciseAnswer } from '@/features/exercises/checkers';
import {
  selectBestExerciseCandidate,
  SUPPORTED_EXERCISE_TYPES,
  targetDifficultyForSession,
} from '@/features/exercises/matchmaking';
import {
  exerciseSchema,
  submittedAnswerSchema,
  type Exercise,
} from '@/features/exercises/schemas';
import { ratingDeltaForAttempt } from '@/features/exercises/scoring';
import type { ExerciseCategory } from '@/features/exercises/types';
import { logSlowServerAction } from '@/lib/slow-action-log';
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';

type GetNextExerciseInput = {
  sessionId?: string;
  seenExerciseIds?: number[];
  category?: ExerciseCategory;
};

type SubmitExerciseAnswerInput = {
  sessionId: string;
  exerciseId: number;
  submittedAnswer: unknown;
  timeSpentMs?: number;
};

export async function getNextExerciseAction(input: GetNextExerciseInput = {}) {
  const startedAt = Date.now();
  try {
    const session = await getOrCreateLearningSession(input.sessionId);
    const recentAttempts = await getRecentAttempts(session.id);
    const recentFingerprints = await getRecentExerciseFingerprints(
      recentAttempts.map((attempt) => attempt.exerciseId),
    );
    const seenExerciseIds = [
      ...(input.seenExerciseIds ?? []),
      ...recentAttempts.map((attempt) => attempt.exerciseId),
    ];
    const targetDifficulty = targetDifficultyForSession(session);
    const candidates = await getExerciseCandidates({
      category: input.category,
      seenExerciseIds,
      targetDifficulty,
      recentFingerprints,
    });
    const exercise = selectBestExerciseCandidate({
      candidates,
      session,
      recentAttempts,
    });

    if (!exercise) {
      return {
        success: true,
        sessionId: session.id,
        exercise: null,
        noMoreExercises: true,
      };
    }

    return {
      success: true,
      sessionId: session.id,
      exercise,
      matchmaking: {
        targetDifficulty,
        currentRating: session.currentRating,
        currentStreak: session.currentStreak,
      },
    };
  } catch (error) {
    console.error('Failed to fetch next exercise:', error);
    return { success: false, error: 'Exercise matchmaking failed' };
  } finally {
    logSlowServerAction('getNextExerciseAction', startedAt, {
      hasSessionId: Boolean(input.sessionId),
      seenExerciseIds: input.seenExerciseIds?.length ?? 0,
      category: input.category ?? 'all',
    });
  }
}

export async function submitExerciseAnswerAction(input: SubmitExerciseAnswerInput) {
  const startedAt = Date.now();
  try {
    const submittedAnswer = submittedAnswerSchema.parse(input.submittedAnswer);
    const session = await getOrCreateLearningSession(input.sessionId);
    const exercise = await getExerciseById(input.exerciseId);

    if (!exercise) {
      const dbRows = await db
        .select({
          id: exercises.id,
          seedKey: exercises.seedKey,
          type: exercises.type,
          isActive: exercises.isActive,
        })
        .from(exercises)
        .where(eq(exercises.id, input.exerciseId))
        .limit(1);
      console.error('submitExerciseAnswerAction: exercise lookup failed', {
        requestedExerciseId: input.exerciseId,
        dbRow: dbRows[0] ?? null,
      });
      return { success: false, error: 'Exercise not found' };
    }

    const result = checkExerciseAnswer(exercise, submittedAnswer, {
      streak: session.currentStreak,
    });
    const ratingDelta = ratingDeltaForAttempt({
      isCorrect: result.isCorrect,
      difficulty: exercise.difficulty,
      streak: session.currentStreak,
    });
    const nextStreak = result.isCorrect ? session.currentStreak + 1 : 0;
    const nextBestStreak = Math.max(session.bestStreak, nextStreak);

    await db.insert(exerciseAttempts).values({
      sessionId: session.id,
      userId: session.userId,
      exerciseId: exercise.id!,
      exerciseType: exercise.type,
      category: exercise.category,
      difficulty: exercise.difficulty,
      skillTags: exercise.skillTags,
      submittedAnswer: result.normalizedAnswer,
      isCorrect: result.isCorrect,
      scoreDelta: result.scoreDelta,
      ratingDelta,
      mistakeCode: result.mistakeCode,
      failedStepIds: result.failedStepIds,
      timeSpentMs: input.timeSpentMs,
    });

    await db
      .update(learningSessions)
      .set({
        currentRating: Math.max(800, session.currentRating + ratingDelta),
        currentStreak: nextStreak,
        bestStreak: nextBestStreak,
        totalScore: session.totalScore + result.scoreDelta,
        completedCount: session.completedCount + 1,
        correctCount: session.correctCount + (result.isCorrect ? 1 : 0),
        lastCategory: exercise.category,
        lastExerciseType: exercise.type,
        updatedAt: new Date(),
      })
      .where(eq(learningSessions.id, session.id));

    return {
      success: true,
      sessionId: session.id,
      result,
      session: {
        currentRating: Math.max(800, session.currentRating + ratingDelta),
        currentStreak: nextStreak,
        bestStreak: nextBestStreak,
        totalScore: session.totalScore + result.scoreDelta,
      },
    };
  } catch (error) {
    console.error('Failed to submit exercise answer:', error);
    return { success: false, error: 'Exercise answer submission failed' };
  } finally {
    logSlowServerAction('submitExerciseAnswerAction', startedAt, {
      sessionId: input.sessionId,
      exerciseId: input.exerciseId,
      hasTimeSpentMs: typeof input.timeSpentMs === 'number',
      submittedAnswerType:
        input.submittedAnswer && typeof input.submittedAnswer === 'object'
          ? String((input.submittedAnswer as { type?: unknown }).type ?? 'unknown')
          : typeof input.submittedAnswer,
    });
  }
}

async function getOrCreateLearningSession(sessionId?: string) {
  const id = sessionId || crypto.randomUUID();

  const existing = await db
    .select()
    .from(learningSessions)
    .where(eq(learningSessions.id, id))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const created = await db
    .insert(learningSessions)
    .values({ id })
    .returning();

  return created[0];
}

async function getRecentAttempts(sessionId: string) {
  return db
    .select({
      exerciseId: exerciseAttempts.exerciseId,
      exerciseType: exerciseAttempts.exerciseType,
      isCorrect: exerciseAttempts.isCorrect,
    })
    .from(exerciseAttempts)
    .where(eq(exerciseAttempts.sessionId, sessionId))
    .orderBy(desc(exerciseAttempts.createdAt))
    .limit(20);
}

async function getExerciseCandidates({
  category,
  seenExerciseIds,
  targetDifficulty,
  recentFingerprints,
}: {
  category?: ExerciseCategory;
  seenExerciseIds: number[];
  targetDifficulty: number;
  recentFingerprints: Set<string>;
}) {
  const conditions = [
    eq(exercises.isActive, true),
    inArray(exercises.type, [...SUPPORTED_EXERCISE_TYPES]),
  ];

  if (category) {
    conditions.push(eq(exercises.category, category));
  }

  const uniqueSeenIds = [...new Set(seenExerciseIds)];

  if (uniqueSeenIds.length > 0) {
    conditions.push(notInArray(exercises.id, uniqueSeenIds));
  }

  const rows = await db
    .select()
    .from(exercises)
    .where(and(...conditions))
    .limit(80);

  return rows
    .map(dbExerciseToDomainExercise)
    .filter((exercise): exercise is Exercise => Boolean(exercise))
    .filter((exercise) => {
      const fp = exerciseFingerprint(exercise);
      return fp ? !recentFingerprints.has(fp) : true;
    })
    .sort(
      (a, b) =>
        Math.abs(a.difficulty - targetDifficulty) -
        Math.abs(b.difficulty - targetDifficulty),
    )
    .slice(0, 30);
}

async function getRecentExerciseFingerprints(exerciseIds: number[]) {
  const ids = [...new Set(exerciseIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return new Set<string>();

  const rows = await db
    .select()
    .from(exercises)
    .where(inArray(exercises.id, ids))
    .limit(200);

  const result = new Set<string>();
  for (const row of rows) {
    const exercise = dbExerciseToDomainExercise(row);
    if (!exercise) continue;
    const fp = exerciseFingerprint(exercise);
    if (fp) result.add(fp);
  }
  return result;
}

function normalizeForFingerprint(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function exerciseFingerprint(exercise: Exercise) {
  const prompt = normalizeForFingerprint(exercise.prompt);

  switch (exercise.type) {
    case 'multiple_choice': {
      const options = exercise.payload.options.map(normalizeForFingerprint).join('|');
      return `mc::${prompt}::${options}`;
    }
    case 'ege_multi_select': {
      const options = exercise.payload.options.map(normalizeForFingerprint).join('|');
      const target = [...exercise.answer.targetSet].sort((a, b) => a - b).join(',');
      return `ms::${prompt}::${options}::${target}`;
    }
    case 'fill_blank': {
      const before = normalizeForFingerprint(exercise.payload.before);
      const after = normalizeForFingerprint(exercise.payload.after);
      const accepted = [...exercise.answer.accepted]
        .map(normalizeForFingerprint)
        .sort()
        .join('|');
      return `fb::${prompt}::${before}::${after}::${accepted}`;
    }
    case 'word_bank_cloze': {
      const text = normalizeForFingerprint(exercise.payload.textWithSlots);
      const bank = [...exercise.payload.wordBank]
        .map(normalizeForFingerprint)
        .sort()
        .join('|');
      const answers = [...exercise.answer.correctBySlot]
        .map(normalizeForFingerprint)
        .join('|');
      return `wbc::${prompt}::${text}::${bank}::${answers}`;
    }
    case 'word_search': {
      const grid = exercise.payload.grid
        .map((row) => row.map(normalizeForFingerprint).join(''))
        .join('|');
      const words = [...exercise.answer.words]
        .map(normalizeForFingerprint)
        .sort()
        .join('|');
      return `ws::${prompt}::${grid}::${words}`;
    }
    case 'punctuation_insert': {
      const tokens = exercise.payload.tokens.map(normalizeForFingerprint).join('|');
      const marks = [...exercise.answer.marks]
        .map((m) => `${m.afterTokenIndex}:${m.mark}`)
        .sort()
        .join('|');
      return `pi::${prompt}::${tokens}::${marks}`;
    }
    case 'ege20_complex_sentence_punctuation': {
      const text = normalizeForFingerprint(exercise.payload.textWithSlots);
      const target = [...exercise.answer.targetSet].sort((a, b) => a - b).join(',');
      return `e20::${prompt}::${text}::${target}`;
    }
    case 'ege21_punctuation_analysis': {
      const sentences = exercise.payload.sentences
        .map((s) => `${s.index}:${normalizeForFingerprint(s.text)}`)
        .join('|');
      const target = [...exercise.answer.targetSet].sort((a, b) => a - b).join(',');
      return `e21::${prompt}::${exercise.payload.targetPunctuation}::${sentences}::${target}`;
    }
  }
}

async function getExerciseById(exerciseId: number) {
  const rows = await db
    .select()
    .from(exercises)
    .where(eq(exercises.id, exerciseId))
    .limit(1);

  return dbExerciseToDomainExercise(rows[0]);
}

function dbExerciseToDomainExercise(row: typeof exercises.$inferSelect | undefined) {
  if (!row) {
    return null;
  }

  const parsed = exerciseSchema.safeParse({
    id: row.id,
    seedKey: row.seedKey,
    type: row.type,
    category: row.category,
    difficulty: row.difficulty,
    skillTags: row.skillTags,
    prompt: row.prompt,
    payload: row.payload,
    answer: row.answer,
    explanation: row.explanation,
    sourceAlignment: row.sourceAlignment ?? extractLegacySourceAlignment(row.visualHint),
    typicalMistake: row.typicalMistake ?? extractLegacyTypicalMistake(row.visualHint),
    mistakeModel: row.mistakeModel ?? undefined,
    algorithmSteps: row.algorithmSteps ?? extractLegacyAlgorithmSteps(row.visualHint),
    transferGroup: row.transferGroup ?? undefined,
    qualityStatus: normalizeQualityStatus(row.qualityStatus),
    visualHint: row.visualHint ?? undefined,
    isActive: row.isActive,
  });

  return parsed.success ? parsed.data : null;
}

function extractLegacySourceAlignment(visualHint: unknown) {
  if (!visualHint || typeof visualHint !== 'object') {
    return undefined;
  }

  return (visualHint as Record<string, unknown>).sourceAlignment;
}

function extractLegacyTypicalMistake(visualHint: unknown) {
  if (!visualHint || typeof visualHint !== 'object') {
    return undefined;
  }

  const value = (visualHint as Record<string, unknown>).typicalMistake;
  return typeof value === 'string' ? value : undefined;
}

function extractLegacyAlgorithmSteps(visualHint: unknown) {
  if (!visualHint || typeof visualHint !== 'object') {
    return undefined;
  }

  const value = (visualHint as Record<string, unknown>).solutionSteps;

  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((step): step is string => typeof step === 'string' && step.trim().length > 0)
    .map((title, index) => ({
      id: `legacy_${index + 1}`,
      title,
      required: true,
    }));
}

function normalizeQualityStatus(value: unknown) {
  if (value === 'review' || value === 'approved' || value === 'archived') {
    return value;
  }

  return 'draft';
}

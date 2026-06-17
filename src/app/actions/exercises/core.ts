'use server';

import { db } from '@/db';
import {
  exerciseAttempts,
  exercises,
  learningSessions,
} from '@/db/schema';
import { checkExerciseAnswer } from '@/features/exercises/checkers';
import {
  submittedAnswerSchema,
  type Exercise,
} from '@/features/exercises/schemas';
import {
  buildEge9BlitzCards,
  isEge9BlitzCardEligibleForNormalPool,
  shuffleBlitzCards,
} from '@/features/exercises/ege9Blitz';
import {
  buildEge13QuickCards,
  isEge13QuickCardEligibleForNormalPool,
  shuffleEge13QuickCards,
} from '@/features/exercises/ege13Quick';
import {
  buildEge15QuickCards,
  shuffleEge15QuickCards,
} from '@/features/exercises/ege15Quick';
import { ratingDeltaForAttempt } from '@/features/exercises/scoring';
import type { ExerciseCategory, ExerciseType } from '@/features/exercises/types';
import { logSlowServerAction } from '@/lib/slow-action-log';
import { eq, inArray, notInArray, sql } from 'drizzle-orm';
import { dbExerciseToDomainExercise } from './domain';
import {
  getExerciseById,
  getNextExerciseForSession,
  getOrCreateLearningSession,
  getRandomFilteredExerciseRows,
  sampleExerciseCandidateRows,
} from './queries';

type GetNextExerciseInput = {
  sessionId?: string;
  seenExerciseIds?: number[];
  category?: ExerciseCategory;
  forceType?: ExerciseType;
};

type GetExerciseBySeedKeyInput = {
  sessionId?: string;
  seedKey: string;
};

type GetExercisesByIdsInput = {
  exerciseIds: number[];
};

type GetExerciseVersionsByIdsInput = {
  exerciseIds: number[];
};

type GetQuickCardsBySeedInput = {
  mode: 'blitz' | 'ege13' | 'ege15';
  seedKey: string;
  rowIndex?: number;
  positionIndex?: number;
  wordIndex?: number;
  cardId?: string;
};

type SubmitExerciseAnswerInput = {
  sessionId: string;
  exerciseId: number;
  submittedAnswer: unknown;
  timeSpentMs?: number;
  returnNextExercise?: boolean;
  seenExerciseIds?: number[];
  category?: ExerciseCategory;
};

type GetBlitzPoolInput = {
  limit?: number;
  seenExerciseIds?: number[];
};

type GetEge13QuickPoolInput = {
  limit?: number;
  seenExerciseIds?: number[];
};

type GetEge15QuickPoolInput = {
  limit?: number;
  seenExerciseIds?: number[];
};

type RefreshEge13QuickCardInput = {
  exerciseId: number;
  cardId: string;
  rowIndex: number;
};

type RefreshEge9BlitzCardInput = {
  exerciseId: number;
  cardId: string;
  rowIndex: number;
  wordIndex: number;
};

type RefreshEge15QuickCardInput = {
  exerciseId: number;
  cardId: string;
  positionIndex?: number;
};

export async function refreshEge9BlitzCardAction(input: RefreshEge9BlitzCardInput) {
  try {
    const exercise = await getExerciseById(input.exerciseId);
    if (!exercise || exercise.type !== 'ege_multi_select') {
      return { success: false, error: 'Exercise not found or wrong type' };
    }
    const cards = buildEge9BlitzCards(exercise);
    const card = cards.find((c) => c.id === input.cardId) ?? cards.find(
      (c) => c.rowIndex === input.rowIndex && c.wordIndex === input.wordIndex,
    );
    if (!card) {
      return { success: false, error: 'Card not found in reassembled exercise' };
    }
    return { success: true, card };
  } catch (error) {
    console.error('Failed to refresh EGE-9 blitz card:', error);
    return { success: false, error: 'Failed to refresh card' };
  }
}

export async function refreshEge13QuickCardAction(input: RefreshEge13QuickCardInput) {
  try {
    const exercise = await getExerciseById(input.exerciseId);
    if (!exercise || exercise.type !== 'ege_multi_select') {
      return { success: false, error: 'Exercise not found or wrong type' };
    }
    const cards = buildEge13QuickCards(exercise);
    const card = cards.find((c) => c.id === input.cardId) ?? cards.find((c) => c.rowIndex === input.rowIndex);
    if (!card) {
      return { success: false, error: 'Card not found in reassembled exercise' };
    }
    return { success: true, card };
  } catch (error) {
    console.error('Failed to refresh EGE-13 quick card:', error);
    return { success: false, error: 'Failed to refresh card' };
  }
}

export async function refreshEge15QuickCardAction(input: RefreshEge15QuickCardInput) {
  try {
    const exercise = await getExerciseById(input.exerciseId);
    if (!exercise || exercise.type !== 'fill_blank') {
      return { success: false, error: 'Exercise not found or wrong type' };
    }
    const cards = buildEge15QuickCards(exercise);
    const card = cards.find((c) => c.id === input.cardId) ?? cards.find((c) => c.positionIndex === input.positionIndex);
    if (!card) {
      return { success: false, error: 'Card not found in reassembled exercise' };
    }
    return { success: true, card };
  } catch (error) {
    console.error('Failed to refresh EGE-15 quick card:', error);
    return { success: false, error: 'Failed to refresh card' };
  }
}

export async function getNextExerciseAction(input: GetNextExerciseInput = {}) {
  const startedAt = Date.now();
  try {
    const session = await getOrCreateLearningSession(input.sessionId);
    const next = await getNextExerciseForSession({
      session,
      category: input.category,
      forceType: input.forceType,
      seenExerciseIds: input.seenExerciseIds,
    });
    return {
      success: true,
      sessionId: session.id,
      ...next,
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

export async function getExerciseBySeedKeyAction(input: GetExerciseBySeedKeyInput) {
  const startedAt = Date.now();
  try {
    const seedKey = input.seedKey.trim();
    if (!seedKey) {
      return { success: false, error: 'Seed key is required' };
    }

    const session = await getOrCreateLearningSession(input.sessionId);
    const rows = await db
      .select()
      .from(exercises)
      .where(eq(exercises.seedKey, seedKey))
      .limit(1);
    const exercise = dbExerciseToDomainExercise(rows[0]);

    if (!exercise) {
      return { success: false, sessionId: session.id, error: 'Exercise not found' };
    }

    return {
      success: true,
      sessionId: session.id,
      exercise,
    };
  } catch (error) {
    console.error('Failed to fetch exercise by seed key:', error);
    return { success: false, error: 'Exercise seed lookup failed' };
  } finally {
    logSlowServerAction('getExerciseBySeedKeyAction', startedAt, {
      hasSessionId: Boolean(input.sessionId),
      hasSeedKey: Boolean(input.seedKey.trim()),
    });
  }
}

export async function getExercisesByIdsAction(input: GetExercisesByIdsInput) {
  const startedAt = Date.now();
  try {
    const ids = [...new Set(input.exerciseIds)]
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, 80);

    if (ids.length === 0) {
      return { success: true, exercises: [] as Exercise[] };
    }

    const rows = await db
      .select()
      .from(exercises)
      .where(inArray(exercises.id, ids))
      .limit(ids.length);
    const freshExercises = rows
      .map(dbExerciseToDomainExercise)
      .filter((exercise): exercise is Exercise => Boolean(exercise));

    return { success: true, exercises: freshExercises };
  } catch (error) {
    console.error('Failed to refresh exercises by ids:', error);
    return { success: false, error: 'Exercise refresh failed' };
  } finally {
    logSlowServerAction('getExercisesByIdsAction', startedAt, {
      exerciseIds: input.exerciseIds.length,
    });
  }
}

export async function getExerciseVersionsByIdsAction(input: GetExerciseVersionsByIdsInput) {
  const startedAt = Date.now();
  try {
    const ids = [...new Set(input.exerciseIds)]
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, 80);

    if (ids.length === 0) {
      return { success: true, versions: [] as Array<{ id: number; updatedAt: string }> };
    }

    const rows = await db
      .select({
        id: exercises.id,
        updatedAt: exercises.updatedAt,
      })
      .from(exercises)
      .where(inArray(exercises.id, ids))
      .limit(ids.length);

    return {
      success: true,
      versions: rows.map((row) => ({
        id: row.id,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error('Failed to refresh exercise versions by ids:', error);
    return { success: false, error: 'Exercise version refresh failed' };
  } finally {
    logSlowServerAction('getExerciseVersionsByIdsAction', startedAt, {
      exerciseIds: input.exerciseIds.length,
    });
  }
}

export async function getQuickCardsBySeedAction(input: GetQuickCardsBySeedInput) {
  const startedAt = Date.now();
  try {
    const seedKey = input.seedKey.trim();
    if (!seedKey) {
      return { success: false, error: 'Seed key is required', cards: [] };
    }

    const rows = await db
      .select()
      .from(exercises)
      .where(eq(exercises.seedKey, seedKey))
      .limit(1);
    const exercise = dbExerciseToDomainExercise(rows[0]);

    if (!exercise) {
      return { success: false, error: 'Exercise not found', cards: [] };
    }

    if (input.mode === 'ege13') {
      if (exercise.type !== 'ege_multi_select') {
        return { success: false, error: 'Quick type 13 expects an EGE multi-select exercise', cards: [] };
      }
      const cards = buildEge13QuickCards(exercise).filter((card) => {
        if (input.cardId) return card.id === input.cardId;
        return !input.rowIndex || card.rowIndex === input.rowIndex;
      });
      return { success: true, cards };
    }

    if (input.mode === 'ege15') {
      if (exercise.type !== 'fill_blank') {
        return { success: false, error: 'Quick type 15 expects a fill-blank exercise', cards: [] };
      }
      const cards = buildEge15QuickCards(exercise).filter((card) => {
        if (input.cardId) return card.id === input.cardId;
        return !input.positionIndex || card.positionIndex === input.positionIndex;
      });
      return { success: true, cards };
    }

    if (exercise.type !== 'ege_multi_select') {
      return { success: false, error: 'Blitz expects an EGE multi-select exercise', cards: [] };
    }
    const cards = buildEge9BlitzCards(exercise).filter((card) => {
      if (input.cardId) return card.id === input.cardId;
      const rowMatches = !input.rowIndex || card.rowIndex === input.rowIndex;
      const wordMatches = !input.wordIndex || card.wordIndex === input.wordIndex;
      return rowMatches && wordMatches;
    });
    return { success: true, cards };
  } catch (error) {
    console.error('Failed to fetch quick cards by seed:', error);
    return { success: false, error: 'Quick seed lookup failed', cards: [] };
  } finally {
    logSlowServerAction('getQuickCardsBySeedAction', startedAt, {
      mode: input.mode,
      hasSeedKey: Boolean(input.seedKey.trim()),
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

    if (!exercise.isActive) {
      return { success: false, error: 'Exercise is inactive' };
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

    const updatedSession = {
      ...session,
      currentRating: Math.max(800, session.currentRating + ratingDelta),
      currentStreak: nextStreak,
      bestStreak: nextBestStreak,
      totalScore: session.totalScore + result.scoreDelta,
      completedCount: session.completedCount + 1,
      correctCount: session.correctCount + (result.isCorrect ? 1 : 0),
      lastCategory: exercise.category,
      lastExerciseType: exercise.type,
    };

    await db.transaction(async (tx) => {
      await tx.insert(exerciseAttempts).values({
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

      await tx
        .update(learningSessions)
        .set({
          currentRating: updatedSession.currentRating,
          currentStreak: updatedSession.currentStreak,
          bestStreak: updatedSession.bestStreak,
          totalScore: updatedSession.totalScore,
          completedCount: updatedSession.completedCount,
          correctCount: updatedSession.correctCount,
          lastCategory: updatedSession.lastCategory,
          lastExerciseType: updatedSession.lastExerciseType,
          updatedAt: sql`now()::timestamp`,
        })
        .where(eq(learningSessions.id, session.id));
    });
    const next = input.returnNextExercise
      ? await getNextExerciseForSession({
          session: updatedSession,
          category: input.category,
          seenExerciseIds: [...new Set([...(input.seenExerciseIds ?? []), exercise.id!])],
        })
      : null;

    return {
      success: true,
      sessionId: session.id,
      result,
      session: {
        currentRating: updatedSession.currentRating,
        currentStreak: updatedSession.currentStreak,
        bestStreak: updatedSession.bestStreak,
        totalScore: updatedSession.totalScore,
      },
      nextExercise: next?.exercise ?? null,
      noMoreExercises: next?.noMoreExercises ?? false,
      matchmaking: next?.matchmaking,
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

export async function getBlitzPoolAction(input: GetBlitzPoolInput = {}) {
  const startedAt = Date.now();
  const limit = Math.min(Math.max(input.limit ?? 80, 10), 160);

  try {
    const conditions = [
      eq(exercises.isActive, true),
      eq(exercises.type, 'ege_multi_select'),
      sql`${exercises.skillTags} @> array['ege.9']::text[]`,
    ];
    const uniqueSeenIds = [...new Set(input.seenExerciseIds ?? [])].filter(
      (id) => Number.isInteger(id) && id > 0,
    );

    if (uniqueSeenIds.length > 0) {
      conditions.push(notInArray(exercises.id, uniqueSeenIds));
    }

    const rows = await getRandomFilteredExerciseRows({ conditions, limit });

    const cards = rows
      .map(dbExerciseToDomainExercise)
      .flatMap((exercise) =>
        exercise?.type === 'ege_multi_select'
          ? buildEge9BlitzCards(exercise).filter(isEge9BlitzCardEligibleForNormalPool)
          : [],
      );

    return {
      success: true,
      cards: shuffleBlitzCards(cards, `${Date.now()}:${cards.length}`).slice(0, 90),
    };
  } catch (error) {
    console.error('Failed to fetch blitz pool:', error);
    return { success: false, error: 'Blitz pool fetch failed', cards: [] };
  } finally {
    logSlowServerAction('getBlitzPoolAction', startedAt, {
      limit,
      seenExerciseIds: input.seenExerciseIds?.length ?? 0,
    });
  }
}

export async function getEge13QuickPoolAction(input: GetEge13QuickPoolInput = {}) {
  const startedAt = Date.now();
  const limit = Math.min(Math.max(input.limit ?? 80, 10), 160);
  const rowLimit = Math.min(limit, 32);

  try {
    const conditions = [
      eq(exercises.isActive, true),
      eq(exercises.type, 'ege_multi_select'),
      sql`${exercises.skillTags} @> array['ege.13']::text[]`,
    ];
    const uniqueSeenIds = [...new Set(input.seenExerciseIds ?? [])].filter(
      (id) => Number.isInteger(id) && id > 0,
    );

    if (uniqueSeenIds.length > 0) {
      conditions.push(notInArray(exercises.id, uniqueSeenIds));
    }

    const rows = await getRandomFilteredExerciseRows({ conditions, limit: rowLimit });

    const cards = rows
      .map(dbExerciseToDomainExercise)
      .flatMap((exercise) =>
        exercise?.type === 'ege_multi_select'
          ? buildEge13QuickCards(exercise).filter(isEge13QuickCardEligibleForNormalPool)
          : [],
      );

    return {
      success: true,
      cards: shuffleEge13QuickCards(cards, `${Date.now()}:${cards.length}`).slice(0, 90),
    };
  } catch (error) {
    console.error('Failed to fetch EGE-13 quick pool:', error);
    return { success: false, error: 'EGE-13 quick pool fetch failed', cards: [] };
  } finally {
    logSlowServerAction('getEge13QuickPoolAction', startedAt, {
      limit,
      rowLimit,
      seenExerciseIds: input.seenExerciseIds?.length ?? 0,
    });
  }
}

export async function getEge15QuickPoolAction(input: GetEge15QuickPoolInput = {}) {
  const startedAt = Date.now();
  const limit = Math.min(Math.max(input.limit ?? 100, 10), 180);

  try {
    const conditions = [
      eq(exercises.isActive, true),
      eq(exercises.type, 'fill_blank'),
      sql`${exercises.skillTags} @> array['ege.15']::text[]`,
    ];
    const uniqueSeenIds = [...new Set(input.seenExerciseIds ?? [])].filter(
      (id) => Number.isInteger(id) && id > 0,
    );

    if (uniqueSeenIds.length > 0) {
      conditions.push(notInArray(exercises.id, uniqueSeenIds));
    }

    const rows = await sampleExerciseCandidateRows({ conditions, limit });

    const cards = rows
      .map(dbExerciseToDomainExercise)
      .flatMap((exercise) =>
        exercise?.type === 'fill_blank' ? buildEge15QuickCards(exercise) : [],
      );

    return {
      success: true,
      cards: shuffleEge15QuickCards(cards, `${Date.now()}:${cards.length}`).slice(0, 100),
    };
  } catch (error) {
    console.error('Failed to fetch EGE-15 quick pool:', error);
    return { success: false, error: 'EGE-15 quick pool fetch failed', cards: [] };
  } finally {
    logSlowServerAction('getEge15QuickPoolAction', startedAt, {
      limit,
      seenExerciseIds: input.seenExerciseIds?.length ?? 0,
    });
  }
}



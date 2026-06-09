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
import { buildEge9BlitzCards, shuffleBlitzCards } from '@/features/exercises/ege9Blitz';
import {
  buildEge13QuickCards,
  shuffleEge13QuickCards,
} from '@/features/exercises/ege13Quick';
import {
  buildEge15QuickCards,
  shuffleEge15QuickCards,
} from '@/features/exercises/ege15Quick';
import { ratingDeltaForAttempt } from '@/features/exercises/scoring';
import type { ExerciseCategory, ExerciseType } from '@/features/exercises/types';
import { stripEge18PromptFromFillBefore } from '@/lib/exercise-type-conversion';
import { logSlowServerAction } from '@/lib/slow-action-log';
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';

type GetNextExerciseInput = {
  sessionId?: string;
  seenExerciseIds?: number[];
  category?: ExerciseCategory;
  forceType?: ExerciseType;
};

type SubmitExerciseAnswerInput = {
  sessionId: string;
  exerciseId: number;
  submittedAnswer: unknown;
  timeSpentMs?: number;
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

type RefreshEge15QuickCardInput = {
  exerciseId: number;
  cardId: string;
  positionIndex?: number;
};

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
      forceType: input.forceType,
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
        updatedAt: sql`now()::timestamp`,
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

    const rows = await db
      .select()
      .from(exercises)
      .where(and(...conditions))
      .limit(limit);

    const cards = rows
      .map(dbExerciseToDomainExercise)
      .flatMap((exercise) =>
        exercise?.type === 'ege_multi_select' ? buildEge9BlitzCards(exercise) : [],
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

    const rows = await db
      .select()
      .from(exercises)
      .where(and(...conditions))
      .limit(limit);

    const cards = rows
      .map(dbExerciseToDomainExercise)
      .flatMap((exercise) =>
        exercise?.type === 'ege_multi_select' ? buildEge13QuickCards(exercise) : [],
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

    const rows = await db
      .select()
      .from(exercises)
      .where(and(...conditions))
      .limit(limit);

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
  forceType,
  seenExerciseIds,
  targetDifficulty,
  recentFingerprints,
}: {
  category?: ExerciseCategory;
  forceType?: ExerciseType;
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

  if (forceType) {
    conditions.push(eq(exercises.type, forceType));
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
    case 'dictation': {
      const audio = normalizeForFingerprint(exercise.payload.audioSrc);
      const text = normalizeForFingerprint(exercise.answer.text);
      return `dict::${prompt}::${audio}::${text}`;
    }
    case 'orthography_repair': {
      const text = normalizeForFingerprint(exercise.payload.text);
      const repairs = exercise.answer.repairs
        .map((repair) => `${repair.targetId}:${normalizeForFingerprint(repair.correct)}`)
        .sort()
        .join('|');
      return `or::${prompt}::${text}::${repairs}`;
    }
    case 'punctuation_insert': {
      const tokens = exercise.payload.tokens.map(normalizeForFingerprint).join('|');
      const marks = [...exercise.answer.marks]
        .map((m) => `${m.afterTokenIndex}:${m.mark}`)
        .sort()
        .join('|');
      return `pi::${prompt}::${tokens}::${marks}`;
    }
    case 'punctuation_constructor': {
      const tokens = exercise.payload.tokens.map(normalizeForFingerprint).join('|');
      const bank = exercise.payload.markBank.join('|');
      const placements = exercise.answer.placements
        .map((m) => `${m.slotIndex}:${m.mark}`)
        .join('|');
      return `pc::${prompt}::${tokens}::${bank}::${placements}`;
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

  const payload =
    row.type === 'fill_blank' &&
    row.skillTags.includes('ege.18') &&
    row.payload &&
    typeof row.payload === 'object' &&
    !Array.isArray(row.payload)
      ? {
          ...(row.payload as Record<string, unknown>),
          before:
            typeof (row.payload as Record<string, unknown>).before === 'string'
              ? stripEge18PromptFromFillBefore(
                  (row.payload as Record<string, unknown>).before as string,
                  row.prompt,
                )
              : (row.payload as Record<string, unknown>).before,
        }
      : row.payload;

  const parsed = exerciseSchema.safeParse({
    id: row.id,
    seedKey: row.seedKey,
    type: row.type,
    category: row.category,
    difficulty: row.difficulty,
    skillTags: row.skillTags,
    prompt: row.prompt,
    payload,
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

  if (!parsed.success) {
    console.error(`Failed to parse exercise ${row.id}:`, parsed.error);
    return null;
  }

  return parsed.data;
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

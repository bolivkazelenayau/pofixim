import type { db } from '@/db';
import { exerciseAttempts, learningSessions } from '@/db/schema';
import { checkExerciseAnswer } from '@/features/exercises/checkers';
import {
  submittedAnswerSchema,
  type Exercise,
} from '@/features/exercises/schemas';
import { ratingDeltaForAttempt } from '@/features/exercises/scoring';
import type { ExerciseCategory } from '@/features/exercises/types';
import type { CheckResult } from '@/features/exercises/types';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type {
  getExerciseById,
  getNextExerciseForSession,
} from './queries';

export type SubmitExerciseAnswerInput = {
  sessionId: string;
  submissionId: string;
  exerciseId: number;
  submittedAnswer: unknown;
  timeSpentMs?: number;
  returnNextExercise?: boolean;
  seenExerciseIds?: number[];
  category?: ExerciseCategory;
};

export type SubmitExerciseAnswerDependencies = {
  db: typeof db;
  getExerciseById: typeof getExerciseById;
  getNextExerciseForSession: typeof getNextExerciseForSession;
};

type SessionSnapshot = {
  currentRating: number;
  currentStreak: number;
  bestStreak: number;
  totalScore: number;
};

type MatchmakingSnapshot = {
  targetDifficulty: number;
  currentRating: number;
  currentStreak: number;
};

export type SavedSubmissionResponse = {
  success: true;
  sessionId: string;
  result: CheckResult;
  session: SessionSnapshot;
  nextExercise: Exercise | null;
  noMoreExercises: boolean;
  matchmaking: MatchmakingSnapshot | null;
};

export type SubmitExerciseAnswerFailure = {
  success: false;
  error: string;
  code?: 'IDEMPOTENCY_CONFLICT';
};

export type SubmitExerciseAnswerResponse =
  | SavedSubmissionResponse
  | SubmitExerciseAnswerFailure;

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'undefined') return 'undefined';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${canonicalize(nestedValue)}`);
  return `{${entries.join(',')}}`;
}

function buildSubmissionFingerprint(exerciseId: number, submittedAnswer: unknown) {
  return `${exerciseId}:${canonicalize(submittedAnswer)}`;
}

function buildIdempotencyConflictResponse(): SubmitExerciseAnswerFailure {
  return {
    success: false,
    code: 'IDEMPOTENCY_CONFLICT',
    error: 'Submission id is already bound to a different exercise answer',
  };
}

function buildSavedSubmissionResponse(
  attempt: typeof exerciseAttempts.$inferSelect,
  sessionId: string,
  exerciseId: number | null,
  submissionFingerprint: string | null,
): SubmitExerciseAnswerResponse {
  if (
    exerciseId === null ||
    attempt.exerciseId !== exerciseId ||
    attempt.requestFingerprint !== submissionFingerprint
  ) {
    return buildIdempotencyConflictResponse();
  }

  return {
    success: true,
    sessionId,
    result: attempt.checkResult as CheckResult,
    session: attempt.sessionSnapshot as SessionSnapshot,
    nextExercise: (attempt.nextExercise as Exercise | null) ?? null,
    noMoreExercises: attempt.noMoreExercises,
    matchmaking: (attempt.matchmaking as MatchmakingSnapshot | null) ?? null,
  };
}

async function findSavedAttempt(
  database: typeof db,
  sessionId: string,
  submissionId: string,
  exerciseId: number | null,
  submissionFingerprint: string | null,
): Promise<SubmitExerciseAnswerResponse | null> {
  if (!sessionId || !submissionId) return null;

  const [attempt] = await database
    .select()
    .from(exerciseAttempts)
    .where(
      and(
        eq(exerciseAttempts.sessionId, sessionId),
        eq(exerciseAttempts.submissionId, submissionId),
      ),
    )
    .limit(1);

  return attempt
    ? buildSavedSubmissionResponse(attempt, sessionId, exerciseId, submissionFingerprint)
    : null;
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505',
  );
}

export async function submitExerciseAnswer(
  input: SubmitExerciseAnswerInput,
  dependencies: SubmitExerciseAnswerDependencies,
): Promise<SubmitExerciseAnswerResponse> {
  const sessionId = typeof input?.sessionId === 'string' ? input.sessionId.trim() : '';
  const submissionId = typeof input?.submissionId === 'string' ? input.submissionId.trim() : '';
  const exerciseId = Number.isInteger(input?.exerciseId) && input.exerciseId > 0
    ? input.exerciseId
    : null;
  const rawTimeSpentMs = input?.timeSpentMs;
  const timeSpentMs =
    typeof rawTimeSpentMs === 'number' && Number.isInteger(rawTimeSpentMs) && rawTimeSpentMs >= 0
      ? rawTimeSpentMs
      : undefined;
  const parsedIncomingAnswer = submittedAnswerSchema.safeParse(input?.submittedAnswer);
  const incomingFingerprint = parsedIncomingAnswer.success && exerciseId !== null
    ? buildSubmissionFingerprint(exerciseId, parsedIncomingAnswer.data)
    : null;

  try {
    if (!sessionId) return { success: false, error: 'Session id is required' };
    if (!z.string().uuid().safeParse(submissionId).success) {
      return { success: false, error: 'Submission id must be a UUID' };
    }
    if (!exerciseId) return { success: false, error: 'Exercise id is invalid' };

    return await dependencies.db.transaction(async (tx) => {
      await tx
        .insert(learningSessions)
        .values({ id: sessionId })
        .onConflictDoNothing({ target: learningSessions.id });

      const [session] = await tx
        .select()
        .from(learningSessions)
        .where(eq(learningSessions.id, sessionId))
        .for('update')
        .limit(1);

      if (!session) {
        throw new Error(`Learning session ${sessionId} was not created or found`);
      }

      const [savedAttempt] = await tx
        .select()
        .from(exerciseAttempts)
        .where(
          and(
            eq(exerciseAttempts.sessionId, session.id),
            eq(exerciseAttempts.submissionId, submissionId),
          ),
        )
        .limit(1);

      if (savedAttempt) {
        return buildSavedSubmissionResponse(
          savedAttempt,
          session.id,
          exerciseId,
          incomingFingerprint,
        );
      }

      const submittedAnswer = submittedAnswerSchema.parse(input.submittedAnswer);
      const submissionFingerprint = buildSubmissionFingerprint(exerciseId, submittedAnswer);
      const exercise = await dependencies.getExerciseById(exerciseId, tx);

      if (!exercise) {
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
      const sessionSnapshot = {
        currentRating: updatedSession.currentRating,
        currentStreak: updatedSession.currentStreak,
        bestStreak: updatedSession.bestStreak,
        totalScore: updatedSession.totalScore,
      };

      const [insertedAttempt] = await tx
        .insert(exerciseAttempts)
        .values({
          sessionId: session.id,
          submissionId,
          requestFingerprint: submissionFingerprint,
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
          timeSpentMs,
          checkResult: result,
          sessionSnapshot,
          nextExercise: null,
          noMoreExercises: false,
          matchmaking: null,
        })
        .returning({ id: exerciseAttempts.id });

      if (!insertedAttempt) {
        throw new Error(`Exercise attempt for submission ${submissionId} was not created`);
      }

      const [persistedSession] = await tx
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
        .where(eq(learningSessions.id, session.id))
        .returning();

      if (!persistedSession) {
        throw new Error(`Learning session ${session.id} disappeared during submission`);
      }

      const next = input.returnNextExercise
        ? await dependencies.getNextExerciseForSession({
            executor: tx,
            session: persistedSession,
            category: input.category,
            seenExerciseIds: [
              ...new Set([
                ...(Array.isArray(input.seenExerciseIds) ? input.seenExerciseIds : []),
                exercise.id!,
              ]),
            ],
          })
        : null;
      const response: SavedSubmissionResponse = {
        success: true,
        sessionId: session.id,
        result,
        session: {
          currentRating: persistedSession.currentRating,
          currentStreak: persistedSession.currentStreak,
          bestStreak: persistedSession.bestStreak,
          totalScore: persistedSession.totalScore,
        },
        nextExercise: next?.exercise ?? null,
        noMoreExercises: next?.noMoreExercises ?? false,
        matchmaking: next?.matchmaking ?? null,
      };

      await tx
        .update(exerciseAttempts)
        .set({
          sessionSnapshot: response.session,
          nextExercise: response.nextExercise,
          noMoreExercises: response.noMoreExercises,
          matchmaking: response.matchmaking,
        })
        .where(eq(exerciseAttempts.id, insertedAttempt.id));

      return response;
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid exercise answer' };
    }
    if (isUniqueViolation(error)) {
      const savedAttempt = await findSavedAttempt(
        dependencies.db,
        sessionId,
        submissionId,
        exerciseId,
        incomingFingerprint,
      );
      if (savedAttempt) return savedAttempt;
    }
    console.error('Failed to submit exercise answer:', error);
    throw error;
  }
}

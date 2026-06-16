import { db } from '@/db';
import {
  exerciseAttempts,
  exercises,
  learningSessions,
} from '@/db/schema';
import {
  selectBestExerciseCandidate,
  SUPPORTED_EXERCISE_TYPES,
  targetDifficultyForSession,
} from '@/features/exercises/matchmaking';
import type { Exercise } from '@/features/exercises/schemas';
import type { ExerciseCategory, ExerciseType } from '@/features/exercises/types';
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import {
  dbExerciseToDomainExercise,
  invalidExerciseIds,
} from './domain';

export type ExerciseCondition = NonNullable<ReturnType<typeof eq>>;

export async function getOrCreateLearningSession(sessionId?: string) {
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

export type LearningSessionRow = Awaited<ReturnType<typeof getOrCreateLearningSession>>;

export async function getNextExerciseForSession({
  session,
  category,
  forceType,
  seenExerciseIds,
}: {
  session: LearningSessionRow;
  category?: ExerciseCategory;
  forceType?: ExerciseType;
  seenExerciseIds?: number[];
}) {
  const recentAttempts = await getRecentAttempts(session.id);
  const recentFingerprints = await getRecentExerciseFingerprints(
    recentAttempts.map((attempt) => attempt.exerciseId),
  );
  const blockedExerciseIds = [
    ...(seenExerciseIds ?? []),
    ...recentAttempts.map((attempt) => attempt.exerciseId),
  ];
  const targetDifficulty = targetDifficultyForSession(session);
  const candidates = await getExerciseCandidates({
    category,
    forceType,
    seenExerciseIds: blockedExerciseIds,
    recentFingerprints,
  });
  const exercise = selectBestExerciseCandidate({
    candidates,
    session,
    recentAttempts,
  });

  if (!exercise) {
    return {
      exercise: null,
      noMoreExercises: true,
      matchmaking: {
        targetDifficulty,
        currentRating: session.currentRating,
        currentStreak: session.currentStreak,
      },
    };
  }

  return {
    exercise,
    noMoreExercises: false,
    matchmaking: {
      targetDifficulty,
      currentRating: session.currentRating,
      currentStreak: session.currentStreak,
    },
  };
}

export async function sampleExerciseCandidateRows({
  conditions,
  limit,
}: {
  conditions: ExerciseCondition[];
  limit: number;
}) {
  const whereExpr = and(...conditions);
  const [bounds] = await db
    .select({
      minId: sql<number | null>`min(${exercises.id})`,
      maxId: sql<number | null>`max(${exercises.id})`,
    })
    .from(exercises)
    .where(whereExpr);

  if (!bounds?.minId || !bounds.maxId) return [];

  const targetLimit = Math.ceil(limit * 1.45);
  const rowsById = new Map<number, typeof exercises.$inferSelect>();
  const attempts = 5;

  for (let attempt = 0; attempt < attempts && rowsById.size < targetLimit; attempt += 1) {
    const pivot = randomIntInclusive(bounds.minId, bounds.maxId);
    const remaining = targetLimit - rowsById.size;
    const forwardLimit = Math.max(1, Math.ceil(remaining / 2));

    const forwardRows = await db
      .select()
      .from(exercises)
      .where(and(whereExpr, sql`${exercises.id} >= ${pivot}`))
      .orderBy(sql`${exercises.id} asc`)
      .limit(forwardLimit);
    for (const row of forwardRows) rowsById.set(row.id, row);

    const backwardLimit = targetLimit - rowsById.size;
    if (backwardLimit <= 0) break;

    const backwardRows = await db
      .select()
      .from(exercises)
      .where(and(whereExpr, sql`${exercises.id} < ${pivot}`))
      .orderBy(desc(exercises.id))
      .limit(backwardLimit);
    for (const row of backwardRows) rowsById.set(row.id, row);
  }

  return shuffleRows([...rowsById.values()]).slice(0, limit);
}

export async function getRandomFilteredExerciseRows({
  conditions,
  limit,
}: {
  conditions: ExerciseCondition[];
  limit: number;
}) {
  const idRows = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(...conditions))
    .orderBy(sql`random()`)
    .limit(limit);

  const ids = idRows.map((row) => row.id);
  if (ids.length === 0) return [];

  const rows = await db
    .select()
    .from(exercises)
    .where(inArray(exercises.id, ids))
    .limit(limit);

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = rowsById.get(id);
    return row ? [row] : [];
  });
}

export async function getExerciseById(exerciseId: number) {
  const rows = await db
    .select()
    .from(exercises)
    .where(eq(exercises.id, exerciseId))
    .limit(1);

  return dbExerciseToDomainExercise(rows[0]);
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
  recentFingerprints,
}: {
  category?: ExerciseCategory;
  forceType?: ExerciseType;
  seenExerciseIds: number[];
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
  const excludedIds = [...new Set([...uniqueSeenIds, ...invalidExerciseIds])];

  if (excludedIds.length > 0) {
    conditions.push(notInArray(exercises.id, excludedIds));
  }

  const rows = await sampleExerciseCandidateRows({
    conditions,
    limit: forceType ? 80 : 180,
  });

  return rows
    .map(dbExerciseToDomainExercise)
    .filter((exercise): exercise is Exercise => Boolean(exercise))
    .filter((exercise) => {
      const fp = exerciseFingerprint(exercise);
      return fp ? !recentFingerprints.has(fp) : true;
    });
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

function randomIntInclusive(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleRows<T>(rows: T[]) {
  const shuffled = [...rows];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
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

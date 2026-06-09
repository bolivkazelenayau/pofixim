import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const categoryEnum = pgEnum('category', ['orthography', 'punctuation', 'mixed']);
export const exerciseTypeEnum = pgEnum('exercise_type', [
  'multiple_choice',
  'ege_multi_select',
  'fill_blank',
  'word_bank_cloze',
  'punctuation_insert',
  'ege20_complex_sentence_punctuation',
  'ege21_punctuation_analysis',
  'highlight_error',
  'match_pairs',
  'order_fragments',
  'text_correction',
  'dictation',
  'word_search',
  'punctuation_constructor',
  'orthography_repair',
]);

export const questions = pgTable('questions', {
  id: serial('id').primaryKey(),
  category: categoryEnum('category').notNull(),
  content: text('content').notNull(), // Текст вопроса или реплика от бота
  options: jsonb('options').notNull(), // Массив вариантов ответа (строки)
  correctOptionIndex: integer('correct_option_index').notNull(),
  explanation: text('explanation').notNull(), // Объяснение правила после ответа
});

export const exercises = pgTable(
  'exercises',
  {
    id: serial('id').primaryKey(),
    seedKey: text('seed_key').unique(),
    type: exerciseTypeEnum('type').notNull(),
    category: categoryEnum('category').notNull(),
    difficulty: integer('difficulty').notNull(),
    skillTags: text('skill_tags').array().notNull(),
    prompt: text('prompt').notNull(),
    payload: jsonb('payload').notNull(),
    answer: jsonb('answer').notNull(),
    explanation: text('explanation').notNull(),
    searchBlob: text('search_blob'),
    searchBlobNormalized: text('search_blob_normalized'),
    sourceAlignment: jsonb('source_alignment'),
    typicalMistake: text('typical_mistake'),
    mistakeModel: jsonb('mistake_model'),
    algorithmSteps: jsonb('algorithm_steps'),
    transferGroup: text('transfer_group'),
    qualityStatus: text('quality_status').notNull().default('draft'),
    visualHint: jsonb('visual_hint'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('exercises_updated_at_idx').on(table.updatedAt),
    index('exercises_type_idx').on(table.type),
    index('exercises_quality_status_idx').on(table.qualityStatus),
    index('exercises_skill_tags_gin_idx').using('gin', table.skillTags),
    index('exercises_type_quality_updated_id_idx').on(
      table.type,
      table.qualityStatus,
      table.updatedAt,
      table.id,
    ),
  ],
);

export const learningSessions = pgTable(
  'learning_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    currentRating: integer('current_rating').notNull().default(900),
    currentStreak: integer('current_streak').notNull().default(0),
    bestStreak: integer('best_streak').notNull().default(0),
    totalScore: integer('total_score').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    lastCategory: categoryEnum('last_category'),
    lastExerciseType: exerciseTypeEnum('last_exercise_type'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('learning_sessions_updated_at_idx').on(table.updatedAt),
  ],
);

export const exerciseAttempts = pgTable(
  'exercise_attempts',
  {
    id: serial('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => learningSessions.id),
    userId: text('user_id'),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id),
    exerciseType: exerciseTypeEnum('exercise_type').notNull(),
    category: categoryEnum('category').notNull(),
    difficulty: integer('difficulty').notNull(),
    skillTags: text('skill_tags').array().notNull(),
    submittedAnswer: jsonb('submitted_answer').notNull(),
    isCorrect: boolean('is_correct').notNull(),
    scoreDelta: integer('score_delta').notNull(),
    ratingDelta: integer('rating_delta').notNull(),
    mistakeCode: text('mistake_code'),
    failedStepIds: text('failed_step_ids').array(),
    timeSpentMs: integer('time_spent_ms'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('exercise_attempts_session_created_at_idx').on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);

export const skillProgress = pgTable('skill_progress', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => learningSessions.id),
  skillTag: text('skill_tag').notNull(),
  rating: integer('rating').notNull().default(900),
  attemptsCount: integer('attempts_count').notNull().default(0),
  correctCount: integer('correct_count').notNull().default(0),
  lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
});

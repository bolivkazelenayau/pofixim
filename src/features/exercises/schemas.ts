import { z } from 'zod';
import { DIFFICULTY_LEVELS, EXERCISE_CATEGORIES, EXERCISE_TYPES } from './types';

const difficultySchema = z.union(
  DIFFICULTY_LEVELS.map((level) => z.literal(level)) as [
    z.ZodLiteral<1>,
    z.ZodLiteral<2>,
  ],
);

const qualityStatusSchema = z.enum(['draft', 'review', 'approved', 'archived']);

const algorithmStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  required: z.boolean().optional(),
});

const baseExerciseSchema = z
  .object({
    id: z.number().int().positive().optional(),
    seedKey: z.string().min(1).nullable().optional(),
    category: z.enum(EXERCISE_CATEGORIES),
    difficulty: difficultySchema,
    skillTags: z.array(z.string().min(1)).default([]),
    prompt: z.string().min(1),
    explanation: z.string().min(1),
    sourceAlignment: z.unknown().optional(),
    typicalMistake: z.string().min(1).optional(),
    mistakeModel: z.unknown().optional(),
    algorithmSteps: z.array(algorithmStepSchema).optional(),
    transferGroup: z.string().min(1).optional(),
    qualityStatus: qualityStatusSchema.default('draft'),
    visualHint: z.unknown().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.qualityStatus !== 'approved') {
      return;
    }

    if (!value.sourceAlignment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceAlignment'],
        message: 'sourceAlignment is required for approved exercises',
      });
    }

    if (!value.typicalMistake) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['typicalMistake'],
        message: 'typicalMistake is required for approved exercises',
      });
    }

    if (!value.algorithmSteps || value.algorithmSteps.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['algorithmSteps'],
        message: 'algorithmSteps are required for approved exercises',
      });
    }
  });

export const multipleChoiceExerciseSchema = baseExerciseSchema
  .extend({
    type: z.literal('multiple_choice'),
    payload: z.object({
      options: z.array(z.string().min(1)).min(2),
    }),
    answer: z.object({
      correctOptionIndex: z.number().int().min(0),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.answer.correctOptionIndex >= value.payload.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answer', 'correctOptionIndex'],
        message: 'correctOptionIndex must be within options bounds',
      });
    }
  });

export const egeMultiSelectExerciseSchema = baseExerciseSchema
  .extend({
    type: z.literal('ege_multi_select'),
    payload: z.object({
      options: z.array(z.string().min(1)).min(2),
      feedback: z
        .object({
          correctAnswer: z.array(z.string().min(1)).min(1),
          explanation: z.array(z.string().min(1)).min(1),
        })
        .optional(),
    }),
    answer: z.object({
      rawAnswerText: z.string().min(1),
      acceptedAnswers: z.array(z.string().min(1)).min(1),
      targetSet: z.array(z.number().int().min(1)).min(1),
    }),
  })
  .superRefine((value, ctx) => {
    for (const idx of value.answer.targetSet) {
      if (idx < 1 || idx > value.payload.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answer', 'targetSet'],
          message: `targetSet contains unknown option index ${idx}`,
        });
      }
    }
  });

export const fillBlankExerciseSchema = baseExerciseSchema.extend({
  type: z.literal('fill_blank'),
  payload: z.object({
    before: z.string(),
    after: z.string(),
    placeholderLabel: z.string().optional(),
  }),
  answer: z.object({
    accepted: z.array(z.string().min(1)).min(1),
    caseSensitive: z.boolean().optional(),
  }),
});

export const wordBankClozeExerciseSchema = baseExerciseSchema
  .extend({
    type: z.literal('word_bank_cloze'),
    payload: z.object({
      textWithSlots: z.string().min(1),
      slotCount: z.number().int().min(1),
      wordBank: z.array(z.string().min(1)).min(1),
    }),
    answer: z.object({
      correctBySlot: z.array(z.string().min(1)).min(1),
      caseSensitive: z.boolean().optional(),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.answer.correctBySlot.length !== value.payload.slotCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answer', 'correctBySlot'],
        message: 'correctBySlot length must match payload.slotCount',
      });
    }
  });

export const orderFragmentsExerciseSchema = baseExerciseSchema
  .extend({
    type: z.literal('order_fragments'),
    payload: z.object({
      fragments: z
        .array(
          z.object({
            id: z.string().min(1),
            text: z.string().min(1),
          }),
        )
        .min(2),
    }),
    answer: z.object({
      correctOrder: z.array(z.string().min(1)).min(2),
    }),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.payload.fragments.map((f) => f.id));
    if (ids.size !== value.payload.fragments.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'fragments'],
        message: 'fragment ids must be unique',
      });
    }
    for (const id of value.answer.correctOrder) {
      if (!ids.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answer', 'correctOrder'],
          message: `correctOrder contains unknown fragment id ${id}`,
        });
      }
    }
    if (new Set(value.answer.correctOrder).size !== value.payload.fragments.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answer', 'correctOrder'],
        message: 'correctOrder must contain each fragment exactly once',
      });
    }
  });

export const wordSearchExerciseSchema = baseExerciseSchema
  .extend({
    type: z.literal('word_search'),
    payload: z.object({
      grid: z.array(z.array(z.string().min(1).max(2)).min(2)).min(2),
      words: z.array(z.string().min(1)).min(1),
      allowDiagonal: z.boolean().optional(),
      allowReverse: z.boolean().optional(),
    }),
    answer: z.object({
      words: z.array(z.string().min(1)).min(1),
      caseSensitive: z.boolean().optional(),
    }),
  })
  .superRefine((value, ctx) => {
    const widths = value.payload.grid.map((row) => row.length);
    const firstWidth = widths[0] ?? 0;
    if (firstWidth < 2 || widths.some((w) => w !== firstWidth)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'grid'],
        message: 'grid must be rectangular with at least 2 columns',
      });
    }
  });

const punctuationMarkSchema = z.enum([',', ':', ';', '-', '—']);

export const punctuationInsertExerciseSchema = baseExerciseSchema.extend({
  type: z.literal('punctuation_insert'),
  payload: z.object({
    tokens: z.array(z.string().min(1)).min(2),
    allowedMarks: z.array(punctuationMarkSchema).min(1),
  }),
  answer: z.object({
    marks: z.array(
      z.object({
        afterTokenIndex: z.number().int().min(0),
        mark: punctuationMarkSchema,
      }),
    ),
  }),
});

const ege21TargetPunctuationSchema = z.enum([
  'comma',
  'dash',
  'colon',
  'semicolon',
]);

const ege21SentenceSchema = z.object({
  index: z.number().int().min(1),
  text: z.string().min(1),
});

export const ege21PunctuationAnalysisExerciseSchema = baseExerciseSchema
  .extend({
    type: z.literal('ege21_punctuation_analysis'),
    payload: z.object({
      targetPunctuation: ege21TargetPunctuationSchema,
      sentences: z.array(ege21SentenceSchema).min(2),
    }),
    answer: z.object({
      rawAnswerText: z.string().min(1),
      acceptedAnswers: z.array(z.string().min(1)).min(1),
      targetSet: z.array(z.number().int().min(1)).min(1),
    }),
  })
  .superRefine((value, ctx) => {
    const sentenceIndexes = new Set(value.payload.sentences.map((s) => s.index));
    const targetSetSorted = [...new Set(value.answer.targetSet)].sort((a, b) => a - b);

    for (const targetIndex of targetSetSorted) {
      if (!sentenceIndexes.has(targetIndex)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answer', 'targetSet'],
          message: `targetSet contains unknown sentence index ${targetIndex}`,
        });
      }
    }
  });

export const ege20ComplexSentencePunctuationExerciseSchema = baseExerciseSchema
  .extend({
    type: z.literal('ege20_complex_sentence_punctuation'),
    payload: z.object({
      textWithSlots: z.string().min(1),
      slots: z.array(z.number().int().min(1)).min(2),
    }),
    answer: z.object({
      rawAnswerText: z.string().min(1),
      acceptedAnswers: z.array(z.string().min(1)).min(1),
      targetSet: z.array(z.number().int().min(1)).min(1),
    }),
  })
  .superRefine((value, ctx) => {
    const slotSet = new Set(value.payload.slots);
    for (const targetIndex of value.answer.targetSet) {
      if (!slotSet.has(targetIndex)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answer', 'targetSet'],
          message: `targetSet contains unknown slot index ${targetIndex}`,
        });
      }
    }
  });

export const exerciseSchema = z.discriminatedUnion('type', [
  multipleChoiceExerciseSchema,
  egeMultiSelectExerciseSchema,
  fillBlankExerciseSchema,
  wordBankClozeExerciseSchema,
  orderFragmentsExerciseSchema,
  wordSearchExerciseSchema,
  punctuationInsertExerciseSchema,
  ege20ComplexSentencePunctuationExerciseSchema,
  ege21PunctuationAnalysisExerciseSchema,
]);

export const exerciseTypeSchema = z.enum(EXERCISE_TYPES);

export const submittedAnswerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('multiple_choice'),
    selectedOptionIndex: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('fill_blank'),
    value: z.string(),
  }),
  z.object({
    type: z.literal('word_bank_cloze'),
    values: z.array(z.string()).min(1),
  }),
  z.object({
    type: z.literal('order_fragments'),
    orderedFragmentIds: z.array(z.string().min(1)).min(2),
  }),
  z.object({
    type: z.literal('word_search'),
    foundWords: z.array(z.string().min(1)),
  }),
  z.object({
    type: z.literal('ege_multi_select'),
    selectedOptionIndexes: z.array(z.number().int().min(1)).min(1),
  }),
  z.object({
    type: z.literal('punctuation_insert'),
    marks: z.array(
      z.object({
        afterTokenIndex: z.number().int().min(0),
        mark: punctuationMarkSchema,
      }),
    ),
  }),
  z.object({
    type: z.literal('ege21_punctuation_analysis'),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal('ege20_complex_sentence_punctuation'),
    value: z.string().min(1),
  }),
]);

export type Exercise = z.infer<typeof exerciseSchema>;
export type MultipleChoiceExercise = z.infer<typeof multipleChoiceExerciseSchema>;
export type FillBlankExercise = z.infer<typeof fillBlankExerciseSchema>;
export type WordBankClozeExercise = z.infer<typeof wordBankClozeExerciseSchema>;
export type OrderFragmentsExercise = z.infer<typeof orderFragmentsExerciseSchema>;
export type WordSearchExercise = z.infer<typeof wordSearchExerciseSchema>;
export type EgeMultiSelectExercise = z.infer<typeof egeMultiSelectExerciseSchema>;
export type PunctuationInsertExercise = z.infer<typeof punctuationInsertExerciseSchema>;
export type Ege21PunctuationAnalysisExercise = z.infer<
  typeof ege21PunctuationAnalysisExerciseSchema
>;
export type Ege20ComplexSentencePunctuationExercise = z.infer<
  typeof ege20ComplexSentencePunctuationExerciseSchema
>;
export type SubmittedAnswer = z.infer<typeof submittedAnswerSchema>;

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

export const dictationExerciseSchema = baseExerciseSchema
  .extend({
    type: z.literal('dictation'),
    payload: z.object({
      title: z.string().min(1),
      audioSrc: z.string().min(1),
      waveform: z.array(z.number().min(0).max(1)).optional(),
      playbackRates: z.array(z.number().positive()).optional(),
    }),
    answer: z.object({
      text: z.string().min(1),
      caseSensitive: z.boolean().optional(),
      ignorePunctuation: z.boolean().optional(),
    }),
  })
  .superRefine((value, ctx) => {
    if (!value.payload.audioSrc.startsWith('/voice_memos/')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'audioSrc'],
        message: 'audioSrc must point to /voice_memos/',
      });
    }
  });

const orthographyRepairTargetSchema = z.object({
  id: z.string().min(1),
  surface: z.string().min(1),
  replacement: z.string().min(1),
  type: z.enum(['word', 'span']),
  options: z.array(z.string().min(1)).optional(),
  occurrence: z.number().int().min(1).optional(),
});

export const orthographyRepairExerciseSchema = baseExerciseSchema
  .extend({
    type: z.literal('orthography_repair'),
    payload: z.object({
      text: z.string().min(1),
      mode: z.enum(['click_then_choose', 'click_then_type']),
      targets: z.array(orthographyRepairTargetSchema).min(1),
      hints: z.array(z.string().min(1)).optional(),
    }),
    answer: z.object({
      repairs: z
        .array(
          z.object({
            targetId: z.string().min(1),
            correct: z.string().min(1),
          }),
        )
        .min(1),
      correctText: z.string().min(1).optional(),
    }),
  })
  .superRefine((value, ctx) => {
    const targetIds = new Set(value.payload.targets.map((target) => target.id));
    const repairIds = new Set(value.answer.repairs.map((repair) => repair.targetId));

    for (const target of value.payload.targets) {
      const occurrence = target.occurrence ?? 1;
      let cursor = 0;
      let foundCount = 0;
      while (cursor <= value.payload.text.length) {
        const foundAt = value.payload.text.indexOf(target.surface, cursor);
        if (foundAt === -1) break;
        foundCount += 1;
        cursor = foundAt + target.surface.length;
      }
      if (foundCount < occurrence) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload', 'targets'],
          message: `target surface "${target.surface}" was not found at occurrence ${occurrence}`,
        });
      }

      if (!repairIds.has(target.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answer', 'repairs'],
          message: `missing repair for target "${target.id}"`,
        });
      }
    }

    for (const repair of value.answer.repairs) {
      if (!targetIds.has(repair.targetId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answer', 'repairs'],
          message: `repair references unknown target "${repair.targetId}"`,
        });
      }
    }
  });

const punctuationMarkSchema = z.enum([',', ':', ';', '-', '—']);

const punctuationConstructorMarkSchema = z.enum([
  'comma',
  'colon',
  'semicolon',
  'dash',
  'quote_open',
  'quote_close',
  'paren_open',
  'paren_close',
  'period',
  'exclamation',
  'question',
  'ellipsis',
]);

const punctuationConstructorSegmentKindSchema = z.enum([
  'author_words',
  'direct_speech',
  'main_clause',
  'subordinate_clause',
  'introductory',
  'enumeration',
  'other',
]);

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

export const punctuationConstructorExerciseSchema = baseExerciseSchema
  .extend({
    type: z.literal('punctuation_constructor'),
    payload: z.object({
      tokens: z.array(z.string().min(1)).min(2),
      markBank: z.array(punctuationConstructorMarkSchema).min(1),
      hints: z.array(z.string().min(1)).optional(),
      guidedSteps: z
        .array(
          z.object({
            id: z.string().min(1),
            title: z.string().min(1),
            slotIndex: z.number().int().min(0),
            marks: z.array(punctuationConstructorMarkSchema).optional(),
          }),
        )
        .optional(),
      segments: z
        .array(
          z.object({
            label: z.string().min(1),
            tokenStart: z.number().int().min(0),
            tokenEnd: z.number().int().min(0),
            kind: punctuationConstructorSegmentKindSchema,
          }),
        )
        .optional(),
    }),
    answer: z.object({
      placements: z.array(
        z.object({
          slotIndex: z.number().int().min(0),
          mark: punctuationConstructorMarkSchema,
        }),
      ),
      slotExplanations: z
        .array(
          z.object({
            slotIndex: z.number().int().min(0),
            marks: z.array(punctuationConstructorMarkSchema).optional(),
            text: z.string().min(1),
          }),
        )
        .optional(),
    }),
  })
  .superRefine((value, ctx) => {
    const maxSlotIndex = value.payload.tokens.length;
    const markBank = new Set(value.payload.markBank);

    for (const placement of value.answer.placements) {
      if (placement.slotIndex > maxSlotIndex) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answer', 'placements'],
          message: `slotIndex ${placement.slotIndex} is outside token slot bounds`,
        });
      }

      if (!markBank.has(placement.mark)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answer', 'placements'],
          message: `answer uses mark ${placement.mark} that is not present in markBank`,
        });
      }
    }

    for (const segment of value.payload.segments ?? []) {
      if (segment.tokenEnd < segment.tokenStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload', 'segments'],
          message: 'segment tokenEnd must be greater than or equal to tokenStart',
        });
      }

      if (segment.tokenEnd >= value.payload.tokens.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload', 'segments'],
          message: `segment tokenEnd ${segment.tokenEnd} is outside token bounds`,
        });
      }
    }

    for (const step of value.payload.guidedSteps ?? []) {
      if (step.slotIndex > maxSlotIndex) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload', 'guidedSteps'],
          message: `guided step slotIndex ${step.slotIndex} is outside token slot bounds`,
        });
      }
    }
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
  dictationExerciseSchema,
  orthographyRepairExerciseSchema,
  punctuationInsertExerciseSchema,
  punctuationConstructorExerciseSchema,
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
    type: z.literal('dictation'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('orthography_repair'),
    repairs: z.array(
      z.object({
        targetId: z.string().min(1),
        value: z.string().min(1),
      }),
    ),
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
    type: z.literal('punctuation_constructor'),
    placements: z.array(
      z.object({
        slotIndex: z.number().int().min(0),
        mark: punctuationConstructorMarkSchema,
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
export type DictationExercise = z.infer<typeof dictationExerciseSchema>;
export type OrthographyRepairExercise = z.infer<
  typeof orthographyRepairExerciseSchema
>;
export type EgeMultiSelectExercise = z.infer<typeof egeMultiSelectExerciseSchema>;
export type PunctuationInsertExercise = z.infer<typeof punctuationInsertExerciseSchema>;
export type PunctuationConstructorExercise = z.infer<
  typeof punctuationConstructorExerciseSchema
>;
export type Ege21PunctuationAnalysisExercise = z.infer<
  typeof ege21PunctuationAnalysisExerciseSchema
>;
export type Ege20ComplexSentencePunctuationExercise = z.infer<
  typeof ege20ComplexSentencePunctuationExerciseSchema
>;
export type SubmittedAnswer = z.infer<typeof submittedAnswerSchema>;

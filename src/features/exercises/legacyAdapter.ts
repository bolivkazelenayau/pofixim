import type { InferSelectModel } from 'drizzle-orm';
import type { questions } from '@/db/schema';
import type { MultipleChoiceExercise } from './schemas';

type LegacyQuestion = InferSelectModel<typeof questions>;

export function questionToMultipleChoiceExercise(
  question: LegacyQuestion,
): MultipleChoiceExercise {
  return {
    id: question.id,
    type: 'multiple_choice',
    category: question.category,
    difficulty: 1,
    skillTags: [question.category],
    prompt: question.content,
    payload: {
      options: normalizeOptions(question.options),
    },
    answer: {
      correctOptionIndex: question.correctOptionIndex,
    },
    explanation: question.explanation,
    qualityStatus: 'approved',
    isActive: true,
  };
}

function normalizeOptions(options: unknown): string[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.filter((option): option is string => typeof option === 'string');
}

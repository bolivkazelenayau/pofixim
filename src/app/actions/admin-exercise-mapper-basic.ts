import { stripEge18PromptFromFillBefore } from '@/lib/exercise-type-conversion';
import type { ExerciseMapperArgs, MapperRecord } from './admin-exercise-mapper-types';

export function mapMultipleChoiceItem({ base, payload, answer }: ExerciseMapperArgs): MapperRecord {
  return {
    ...base,
    options: Array.isArray(payload.options) ? payload.options.filter((v): v is string => typeof v === 'string') : [],
    correctOptionIndex: typeof answer.correctOptionIndex === 'number' ? answer.correctOptionIndex : 0,
  };
}

export function mapEgeMultiSelectItem({ base, payload, answer }: ExerciseMapperArgs): MapperRecord {
  return {
    ...base,
    options: Array.isArray(payload.options) ? payload.options.filter((v): v is string => typeof v === 'string') : [],
    multiCorrectOptionIndexes: Array.isArray(answer.targetSet)
      ? answer.targetSet.filter((v): v is number => typeof v === 'number')
      : [],
  };
}

export function mapFillBlankItem({ row, base, payload, answer }: ExerciseMapperArgs): MapperRecord {
  const isEge18 = row.skillTags.includes('ege.18');
  const fillBefore = typeof payload.before === 'string' ? payload.before : '';

  return {
    ...base,
    fillBefore: isEge18
      ? stripEge18PromptFromFillBefore(fillBefore, row.prompt)
      : fillBefore,
    fillAfter: typeof payload.after === 'string' ? payload.after : '',
    fillAccepted: Array.isArray(answer.accepted) ? answer.accepted.filter((v): v is string => typeof v === 'string') : [],
    fillCaseSensitive: Boolean(answer.caseSensitive),
  };
}

export function mapWordBankClozeItem({ base, payload, answer }: ExerciseMapperArgs): MapperRecord {
  return {
    ...base,
    wordBankTextWithSlots:
      typeof payload.textWithSlots === 'string' ? payload.textWithSlots : '',
    wordBankWords: Array.isArray(payload.wordBank)
      ? payload.wordBank.filter((v): v is string => typeof v === 'string')
      : [],
    wordBankCorrectBySlot: Array.isArray(answer.correctBySlot)
      ? answer.correctBySlot.filter((v): v is string => typeof v === 'string')
      : [],
    wordBankCaseSensitive: Boolean(answer.caseSensitive),
  };
}

export function mapWordSearchItem({ base, payload, answer }: ExerciseMapperArgs): MapperRecord {
  return {
    ...base,
    wordSearchGridRows: Array.isArray(payload.grid)
      ? (payload.grid as unknown[])
          .map((row) =>
            Array.isArray(row)
              ? row
                  .map((cell) => (typeof cell === 'string' ? cell : ''))
                  .join('')
              : '',
          )
          .filter(Boolean)
      : [],
    wordSearchWords: Array.isArray(answer.words)
      ? answer.words.filter((v): v is string => typeof v === 'string')
      : [],
    wordSearchCaseSensitive: Boolean(answer.caseSensitive),
  };
}

export function mapOrderFragmentsItem({ base, payload, answer }: ExerciseMapperArgs): MapperRecord {
  return {
    ...base,
    orderFragments: Array.isArray(payload.fragments)
      ? payload.fragments
          .map((f) => (f ?? {}) as Record<string, unknown>)
          .filter((f) => typeof f.id === 'string' && typeof f.text === 'string')
          .map((f) => ({ id: String(f.id), text: String(f.text) }))
      : [],
    orderCorrectOrder: Array.isArray(answer.correctOrder)
      ? answer.correctOrder.filter((v): v is string => typeof v === 'string')
      : [],
  };
}

export function mapPunctuationInsertItem({ base, payload, answer }: ExerciseMapperArgs): MapperRecord {
  return {
    ...base,
    punctuationTokens: Array.isArray(payload.tokens) ? payload.tokens.filter((v): v is string => typeof v === 'string') : [],
    punctuationAllowedMarks: Array.isArray(payload.allowedMarks) ? payload.allowedMarks : [','],
    punctuationMarks: Array.isArray(answer.marks) ? answer.marks : [],
  };
}

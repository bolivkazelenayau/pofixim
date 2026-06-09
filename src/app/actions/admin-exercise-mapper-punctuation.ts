import type { PunctuationConstructorMark } from './admin-types';
import type { ExerciseMapperArgs, MapperRecord } from './admin-exercise-mapper-types';

export function mapPunctuationConstructorItem({ base, payload, answer }: ExerciseMapperArgs): MapperRecord {
  return {
    ...base,
    punctuationConstructorTokens: Array.isArray(payload.tokens)
      ? payload.tokens.filter((v): v is string => typeof v === 'string')
      : [],
    punctuationConstructorMarkBank: Array.isArray(payload.markBank)
      ? payload.markBank.filter((v): v is PunctuationConstructorMark =>
          typeof v === 'string',
        )
      : [],
    punctuationConstructorHints: Array.isArray(payload.hints)
      ? payload.hints.filter((v): v is string => typeof v === 'string')
      : [],
    punctuationConstructorGuidedSteps: Array.isArray(payload.guidedSteps)
      ? payload.guidedSteps
          .map((s) => (s ?? {}) as Record<string, unknown>)
          .filter(
            (s) =>
              typeof s.id === 'string' &&
              typeof s.title === 'string' &&
              typeof s.slotIndex === 'number',
          )
          .map((s) => ({
            id: String(s.id),
            title: String(s.title),
            slotIndex: Number(s.slotIndex),
            marks: Array.isArray(s.marks)
              ? s.marks
                  .filter((mark): mark is string => typeof mark === 'string')
                  .map((mark) => mark as PunctuationConstructorMark)
              : undefined,
          }))
      : [],
    punctuationConstructorSegments: Array.isArray(payload.segments)
      ? payload.segments
          .map((s) => (s ?? {}) as Record<string, unknown>)
          .filter(
            (s) =>
              typeof s.label === 'string' &&
              typeof s.tokenStart === 'number' &&
              typeof s.tokenEnd === 'number' &&
              typeof s.kind === 'string',
          )
          .map((s) => ({
            label: String(s.label),
            tokenStart: Number(s.tokenStart),
            tokenEnd: Number(s.tokenEnd),
            kind: String(s.kind),
          }))
      : [],
    punctuationConstructorPlacements: Array.isArray(answer.placements)
      ? answer.placements
          .map((p) => (p ?? {}) as Record<string, unknown>)
          .filter(
            (p) => typeof p.slotIndex === 'number' && typeof p.mark === 'string',
          )
          .map((p) => ({
            slotIndex: Number(p.slotIndex),
            mark: String(p.mark) as PunctuationConstructorMark,
          }))
      : [],
    punctuationConstructorSlotExplanations: Array.isArray(answer.slotExplanations)
      ? answer.slotExplanations
          .map((s) => (s ?? {}) as Record<string, unknown>)
          .filter(
            (s) => typeof s.slotIndex === 'number' && typeof s.text === 'string',
          )
          .map((s) => ({
            slotIndex: Number(s.slotIndex),
            marks: Array.isArray(s.marks)
              ? s.marks
                  .filter((mark): mark is string => typeof mark === 'string')
                  .map((mark) => mark as PunctuationConstructorMark)
              : undefined,
            text: String(s.text),
          }))
      : [],
  };
}

export function mapEge20PunctuationItem({ base, payload, answer }: ExerciseMapperArgs): MapperRecord {
  return {
    ...base,
    ege20TextWithSlots:
      typeof payload.textWithSlots === 'string' ? payload.textWithSlots : '',
    ege20Slots: Array.isArray(payload.slots)
      ? payload.slots.filter((v): v is number => typeof v === 'number')
      : [],
    ege20TargetSet: Array.isArray(answer.targetSet)
      ? answer.targetSet.filter((v): v is number => typeof v === 'number')
      : [],
  };
}

export function mapEge21PunctuationItem({ base, payload, answer }: ExerciseMapperArgs): MapperRecord {
  return {
    ...base,
    ege21TargetPunctuation:
      typeof payload.targetPunctuation === 'string'
        ? payload.targetPunctuation
        : 'comma',
    ege21Sentences: Array.isArray(payload.sentences)
      ? payload.sentences
          .map((s) => (s ?? {}) as Record<string, unknown>)
          .filter((s) => typeof s.index === 'number' && typeof s.text === 'string')
          .map((s) => ({ index: Number(s.index), text: String(s.text) }))
      : [],
    ege21TargetSet: Array.isArray(answer.targetSet)
      ? answer.targetSet.filter((v): v is number => typeof v === 'number')
      : [],
  };
}

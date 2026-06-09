import type { ExerciseMapperArgs, MapperRecord } from './admin-exercise-mapper-types';

export function mapOrthographyRepairItem({ base, payload, answer }: ExerciseMapperArgs): MapperRecord {
  return {
    ...base,
    orthographyRepairText:
      typeof payload.text === 'string' ? payload.text : '',
    orthographyRepairMode:
      payload.mode === 'click_then_type' ? 'click_then_type' : 'click_then_choose',
    orthographyRepairTargets: Array.isArray(payload.targets)
      ? payload.targets
          .map((target) => (target ?? {}) as Record<string, unknown>)
          .filter(
            (target) =>
              typeof target.id === 'string' &&
              typeof target.surface === 'string' &&
              typeof target.replacement === 'string' &&
              typeof target.type === 'string',
          )
          .map((target) => ({
            id: String(target.id),
            surface: String(target.surface),
            replacement: String(target.replacement),
            type: target.type === 'span' ? 'span' as const : 'word' as const,
            options: Array.isArray(target.options)
              ? target.options.filter((v): v is string => typeof v === 'string')
              : undefined,
            occurrence:
              typeof target.occurrence === 'number'
                ? Number(target.occurrence)
                : undefined,
          }))
      : [],
    orthographyRepairHints: Array.isArray(payload.hints)
      ? payload.hints.filter((v): v is string => typeof v === 'string')
      : [],
    orthographyRepairRepairs: Array.isArray(answer.repairs)
      ? answer.repairs
          .map((repair) => (repair ?? {}) as Record<string, unknown>)
          .filter(
            (repair) =>
              typeof repair.targetId === 'string' &&
              typeof repair.correct === 'string',
          )
          .map((repair) => ({
            targetId: String(repair.targetId),
            correct: String(repair.correct),
          }))
      : [],
    orthographyRepairCorrectText:
      typeof answer.correctText === 'string' ? answer.correctText : '',
  };
}

export function mapDictationItem({ base, payload, answer }: ExerciseMapperArgs): MapperRecord {
  return {
    ...base,
    dictationTitle: typeof payload.title === 'string' ? payload.title : '',
    dictationAudioSrc:
      typeof payload.audioSrc === 'string' ? payload.audioSrc : '',
    dictationWaveform: Array.isArray(payload.waveform)
      ? payload.waveform.filter((v): v is number => typeof v === 'number')
      : [],
    dictationPlaybackRates: Array.isArray(payload.playbackRates)
      ? payload.playbackRates.filter((v): v is number => typeof v === 'number')
      : [],
    dictationText: typeof answer.text === 'string' ? answer.text : '',
    dictationCaseSensitive: Boolean(answer.caseSensitive),
    dictationIgnorePunctuation: Boolean(answer.ignorePunctuation),
  };
}

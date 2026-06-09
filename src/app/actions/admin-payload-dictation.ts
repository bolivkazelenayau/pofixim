import type { ExerciseEditorInput } from './admin-types';
import type { AdminExercisePayloadBase } from './admin-payload-types';

export function buildDictationPayload(
  input: ExerciseEditorInput,
  base: AdminExercisePayloadBase,
) {
  const answerText = (input.dictationText ?? '').trim();
  const audioSrc = (input.dictationAudioSrc ?? '').trim();

  return {
    ...base,
    payload: {
      title: (input.dictationTitle ?? '').trim() || base.prompt,
      audioSrc,
      ...((input.dictationWaveform ?? []).length > 0
        ? { waveform: input.dictationWaveform }
        : {}),
      ...((input.dictationPlaybackRates ?? []).length > 0
        ? { playbackRates: input.dictationPlaybackRates }
        : {}),
    },
    answer: {
      text: answerText || 'Текст диктанта.',
      caseSensitive: Boolean(input.dictationCaseSensitive),
      ignorePunctuation: Boolean(input.dictationIgnorePunctuation),
    },
  };
}

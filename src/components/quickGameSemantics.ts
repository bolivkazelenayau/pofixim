export type QuickGameFinishReason = 'explicit' | 'timer';

export function shouldScoreQuickGameFinish(reason: QuickGameFinishReason) {
  return reason === 'explicit' || reason === 'timer';
}

export const PRESS_TAP = { scale: 0.96 } as const;

export const QUICK_FEEDBACK_TRANSITION = {
  duration: 0.16,
  ease: 'easeOut',
} as const;

export function whenMotion<T extends object>(enabled: boolean, value: T) {
  return enabled ? value : {};
}

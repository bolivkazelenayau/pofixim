const SLOW_ACTION_THRESHOLD_MS = 100;

export function logSlowServerAction(
  action: string,
  startedAt: number,
  details: Record<string, unknown>,
) {
  const durationMs = Date.now() - startedAt;
  if (durationMs < SLOW_ACTION_THRESHOLD_MS) return;

  console.warn(`[slow-action] ${action}`, {
    durationMs,
    ...details,
  });
}

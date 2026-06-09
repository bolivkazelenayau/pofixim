export function logAdminDebug(event: string, details?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    console.info(`[admin-debug] ${event} ${JSON.stringify(details ?? {})}`);
  } catch {
    console.info(`[admin-debug] ${event}`, details ?? {});
  }
}

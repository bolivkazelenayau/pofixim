export function isAdminDebugEnabled() {
  if (typeof window === 'undefined') return false;
  return (
    window.localStorage.getItem('adminDebug') === 'true' ||
    new URLSearchParams(window.location.search).get('adminDebug') === '1'
  );
}

export function logAdminDebug(event: string, details?: Record<string, unknown>) {
  if (!isAdminDebugEnabled()) return;
  try {
    console.info(`[admin-debug] ${event} ${JSON.stringify(details ?? {})}`);
  } catch {
    console.info(`[admin-debug] ${event}`, details ?? {});
  }
}

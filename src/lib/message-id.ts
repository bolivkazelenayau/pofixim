export function createMessageId(suffix?: string) {
  const c = globalThis.crypto as Crypto | undefined;
  let baseId: string;

  if (c && typeof c.randomUUID === 'function') {
    baseId = c.randomUUID();
  } else if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    baseId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } else {
    baseId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  return suffix ? `${baseId}-${suffix}` : baseId;
}

function parseAdminDateLike(value: string | Date | null | undefined) {
  if (value instanceof Date) return value;

  const raw = String(value ?? '').trim();
  if (!raw) return new Date(NaN);

  // Stable admin mode:
  // strings without an explicit timezone are shown exactly as local wall time
  // stored in the DB, without any implicit UTC conversion.
  const hasExplicitZone = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/.test(raw);
  const normalized = hasExplicitZone
    ? raw.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
    : raw.replace(' ', 'T');

  return new Date(normalized);
}

export function formatAdminDateTime(value: string | Date | null | undefined) {
  const date = parseAdminDateLike(value);
  if (Number.isNaN(date.getTime())) return 'дата неизвестна';

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatAdminTime(value: string | Date | null | undefined) {
  const date = parseAdminDateLike(value);
  if (Number.isNaN(date.getTime())) return '--:--';

  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

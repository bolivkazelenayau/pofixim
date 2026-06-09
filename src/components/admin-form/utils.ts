import { formatAdminDateTime, formatAdminTime } from '@/lib/date-time';
import type { DatabaseIndicator } from './DatabaseSaveIndicator';

export function slugFromPrompt(prompt: string) {
  const translitMap: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const transliterated = prompt
    .toLowerCase()
    .split('')
    .map((ch) => translitMap[ch] ?? ch)
    .join('');
  const cleaned = transliterated
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return cleaned.slice(0, 32) || 'task';
}

export function randomShortId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export function formatUpdatedAt(value: string) {
  return formatAdminDateTime(value);
}

export function clearPendingDraftMarker(id: number) {
  const pendingValue = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('admin_pending_draft_id='))
    ?.split('=')[1];
  if (pendingValue === String(id)) {
    document.cookie = 'admin_pending_draft_id=; Path=/admin; Max-Age=0; SameSite=Lax';
  }
}

export function buildDatabaseIndicator(
  state: 'draft' | 'local' | 'saving' | 'saved',
  savedAt: Date | null,
): DatabaseIndicator {
  switch (state) {
    case 'saved':
      return {
        label: 'В БД',
        detail: savedAt ? `сохранено ${formatAdminTime(savedAt)}` : 'актуальная версия',
        box: 'border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
        dot: 'bg-emerald-500',
      };
    case 'saving':
      return {
        label: 'Сохранение...',
        detail: 'запись в БД',
        box: 'border-sky-200 bg-sky-50/80 text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200',
        dot: 'animate-pulse bg-sky-500',
      };
    case 'local':
      return {
        label: 'Только локально',
        detail: 'ждёт записи в БД',
        box: 'border-amber-200 bg-amber-50/80 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
        dot: 'bg-amber-500',
      };
    default:
      return {
        label: 'Новый черновик',
        detail: 'ещё не в БД',
        box: 'border-stroke bg-surface text-foreground/65 dark:bg-foreground/5',
        dot: 'bg-foreground/25',
      };
  }
}

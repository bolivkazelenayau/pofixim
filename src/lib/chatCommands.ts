export const SLASH_COMMANDS = [
  {
    command: '/dictation',
    title: 'Диктант',
    description: 'Войс с проверкой расшифровки',
  },
  {
    command: '/punctuation_constructor',
    title: 'Конструктор пунктуации',
    description: 'Случайное задание из пула',
  },
  {
    command: '/orthography_repair',
    title: 'Ремонт орфографии',
    description: 'Случайное задание из пула',
  },
  {
    command: '/blitz',
    title: 'Блиц',
    description: 'Открыть быстрый тестовый режим',
  },
  {
    command: '/ege13_quick',
    title: 'Тип 13',
    description: 'Слитно или раздельно',
  },
  {
    command: '/ege15_quick',
    title: 'Тип 15',
    description: 'Одна Н или НН',
  },
  {
    command: '/seed',
    title: 'Seed key',
    description: 'Открыть конкретное задание',
  },
  {
    command: '/qseed',
    title: 'Quick seed',
    description: 'Открыть quick-карточку',
  },
  {
    command: '/stats',
    title: 'Рейтинг',
    description: 'Посмотреть таблицу лидеров',
  },
  {
    command: '/start',
    title: 'Сброс',
    description: 'Начать тренировку заново',
  },
] as const;

export type SlashCommand = (typeof SLASH_COMMANDS)[number]['command'];

export type QuickSeedMode = 'blitz' | 'ege13' | 'ege15';

export type QuickSeedCommand = {
  mode: QuickSeedMode;
  seedKey: string;
  rowIndex?: number;
  positionIndex?: number;
  wordIndex?: number;
  cardId?: string;
};

function parsePositiveInt(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function normalizeQuickSeedText(text: string) {
  return text.trim().replace(/^(?:\/?qseed)(?:\/qseed)*(?=\s|$)/iu, (prefix) => {
    const count = prefix.match(/qseed/giu)?.length ?? 0;
    return Array.from({ length: count }, () => '/qseed').join(' ');
  });
}

export function normalizeSeedCommandText(text: string) {
  return text.trim().replace(/^\/?(seed|exercise)(?:\/\1)*(?=\s|$)/iu, (prefix) => {
    const command = prefix.match(/exercise/iu) ? '/exercise' : '/seed';
    const count = prefix.match(/seed|exercise/giu)?.length ?? 0;
    return Array.from({ length: count }, () => command).join(' ');
  });
}

export function parseQuickSeedCommand(text: string): QuickSeedCommand | null {
  const parts = normalizeQuickSeedText(text).split(/\s+/u).filter(Boolean);
  while (/^\/?qseed$/iu.test(parts[0] ?? '')) {
    parts.shift();
  }
  if (parts.length < 2) return null;

  const modeAlias = parts[0].toLowerCase();
  const mode: QuickSeedMode | null =
    modeAlias === 'blitz' || modeAlias === 'ege9'
      ? 'blitz'
      : modeAlias === 'ege13' || modeAlias === '13'
        ? 'ege13'
        : modeAlias === 'ege15' || modeAlias === '15'
          ? 'ege15'
          : null;
  if (!mode) return null;

  const seedKey = parts[1];
  const options = new Map<string, string>();
  for (const part of parts.slice(2)) {
    const [rawKey, ...rawValue] = part.split('=');
    const key = rawKey?.toLowerCase();
    const value = rawValue.join('=');
    if (key && value) options.set(key, value);
  }

  const positionalSelector = parts[2]?.includes('=') ? undefined : parts[2];

  return {
    mode,
    seedKey,
    rowIndex: parsePositiveInt(
      options.get('row') ?? options.get('r') ?? (mode === 'ege13' ? positionalSelector : undefined),
    ),
    positionIndex: parsePositiveInt(
      options.get('pos') ?? options.get('position') ?? (mode === 'ege15' ? positionalSelector : undefined),
    ),
    wordIndex: parsePositiveInt(options.get('word') ?? options.get('w')),
    cardId: options.get('card') ?? options.get('id'),
  };
}

export function looksLikeQuickSeedCommand(text: string) {
  return /^\/?qseed(?:\s|\/|$)/iu.test(text.trim());
}

export function quickSeedUsageText() {
  return 'Команда qseed неполная. Формат: `/qseed blitz <seed> row=1 word=1`, `/qseed ege13 <seed> row=1`, `/qseed ege15 <seed> pos=1`.';
}

export function normalizeNestedSeedCommand(text: string) {
  const value = normalizeQuickSeedText(normalizeSeedKeyInput(text));

  if (/^\/?qseed\s+/iu.test(value)) {
    const args = value
      .split(/\s+/u)
      .filter((part) => !/^\/?qseed$/iu.test(part))
      .join(' ');
    return args ? `/qseed ${args}` : null;
  }

  if (/^(?:blitz|ege9|ege13|13|ege15|15)\s+\S+/iu.test(value)) {
    return `/qseed ${value}`;
  }

  return null;
}

export function normalizeSeedKeyInput(text: string) {
  const parts = normalizeSeedCommandText(text).split(/\s+/u).filter(Boolean);
  while (/^\/?(?:seed|exercise)$/iu.test(parts[0] ?? '')) {
    parts.shift();
  }
  return parts.join(' ');
}

export function looksLikeBareSeedKey(text: string) {
  const value = text.trim();
  if (!value || value.startsWith('/') || /\s/u.test(value)) return false;
  if (/^(?:seed|exercise|qseed)$/iu.test(value)) return false;

  return /^(?=.*\d)[a-z0-9]+(?:-[a-z0-9]+)+$/iu.test(value);
}

export function getVisiblePastedCommandText(text: string) {
  const value = text.trim();
  const quickSeed = parseQuickSeedCommand(value);
  if (quickSeed && looksLikeQuickSeedCommand(value)) {
    return normalizeQuickSeedText(value)
      .split(/\s+/u)
      .filter((part) => !/^\/?qseed$/iu.test(part))
      .join(' ');
  }

  if (/^\/?(?:seed|exercise)\s+/iu.test(value)) {
    const seedKey = normalizeSeedKeyInput(value);
    return looksLikeBareSeedKey(seedKey) ? seedKey : null;
  }

  return null;
}

export function getCommandAwarePasteValue(
  currentValue: string,
  pastedText: string,
  selectionStart: number,
  selectionEnd: number,
) {
  const visibleCommandText = getVisiblePastedCommandText(pastedText);
  const normalizedPastedText = visibleCommandText
    ?? (looksLikeBareSeedKey(pastedText) ? pastedText.trim() : null);
  if (!normalizedPastedText) return null;

  const prefixMatch = currentValue.match(/^(\s*\/(?:seed|exercise|qseed)\s*)/iu);
  const commandPrefix = prefixMatch?.[1];
  if (commandPrefix && selectionStart >= commandPrefix.length) {
    const before = currentValue.slice(0, selectionStart);
    const after = currentValue.slice(selectionEnd);
    const separator = /\s$/u.test(before) ? '' : ' ';
    return `${before}${separator}${normalizedPastedText}${after}`;
  }

  if (currentValue.trim().length > 0) return null;

  return normalizedPastedText;
}

export function normalizeExerciseSwitchText(value: string) {
  return String(value ?? '')
    .replace(/\u00ad/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractPromptFromQuestionText(fullText: string) {
  const clean = normalizeExerciseSwitchText(fullText);
  const match = clean.match(/^(.*?)(?=\s*1(?:\)|(?=\s*\())\s*)/u);
  return match ? match[1].trim() : '';
}

export function extractOptionsFromQuestionText(fullText: string) {
  const clean = normalizeExerciseSwitchText(fullText)
    .replace(/\s*Пояснение\b.*$/u, '')
    .replace(/\s*Ответ:\s*.*$/u, '');
  const matches = [
    ...clean.matchAll(
      /(?:^|\s)([1-5])(?:\)|(?=\s*\())\s*([\s\S]*?)(?=(?:\s[1-5](?:\)|(?=\s*\())\s*)|$)/gu,
    ),
  ];
  if (matches.length < 5) return [];

  const firstFive = matches.slice(0, 5);
  const validOrder = firstFive.every((match, index) => Number(match[1]) === index + 1);
  if (!validOrder) return [];

  return firstFive
    .map((match) => normalizeExerciseSwitchText(match[2]))
    .filter(Boolean);
}

export function parseIndexCsv(raw: string) {
  return raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export function normalizeNumberAnswerSignature(raw: string) {
  const clean = raw.trim();
  if (!clean) return '';

  const values = /[,;\s|/.\-]/u.test(clean)
    ? clean.split(/[^\d]+/u).map((value) => Number(value))
    : clean
        .replace(/[^\d]/g, '')
        .split('')
        .map((value) => Number(value));

  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))]
    .sort((a, b) => a - b)
    .join('');
}

const EGE18_PROMPT_PREFIX_RE =
  /^\s*у(?:\u00ad)?ка(?:\u00ad)?жи(?:\u00ad)?те\s+цифр[уы]\(-ы\)\s*,?\s*на\s+месте\s+ко(?:\u00ad)?то(?:\u00ad)?рой\(-ых\)\s+долж(?:\u00ad)?на\(-ы\)\s+сто(?:\u00ad)?ять\s+за(?:\u00ad)?пя(?:\u00ad)?тая\(-ые\)\s*\.?\s*/iu;

function normalizePromptLeakText(value: string) {
  return String(value ?? '')
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function stripEge18PromptFromFillBefore(fillBefore: string, prompt?: string) {
  const raw = String(fillBefore ?? '');
  const withoutKnownPrompt = raw.replace(EGE18_PROMPT_PREFIX_RE, '').trimStart();
  if (withoutKnownPrompt !== raw) {
    return withoutKnownPrompt;
  }

  const cleanPrompt = String(prompt ?? '').trim();
  if (!cleanPrompt || !normalizePromptLeakText(raw).startsWith(normalizePromptLeakText(cleanPrompt))) {
    return raw;
  }

  const directPrefix = raw.slice(0, cleanPrompt.length);
  if (normalizePromptLeakText(directPrefix) === normalizePromptLeakText(cleanPrompt)) {
    return raw.slice(cleanPrompt.length).trimStart();
  }

  return raw;
}

export function serializeMultiAnswerForFillBlank(raw: string) {
  return [...new Set(parseIndexCsv(raw))].sort((a, b) => a - b).join('');
}

export function parseFillAcceptedSignature(raw: string) {
  const accepted = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const first = accepted[0] ?? '';

  return [
    ...new Set(
      first
        .replace(/[^\d]/g, '')
        .split('')
        .map((char) => Number(char))
        .filter((num) => Number.isInteger(num) && num > 0),
    ),
  ]
    .sort((a, b) => a - b)
    .join(', ');
}

export function buildFillBlankQuestionText(prompt: string, options: string[]) {
  const cleanPrompt = prompt.trim();
  const cleanOptions = options.map((option) => option.trim()).filter(Boolean);
  if (!cleanPrompt || cleanOptions.length === 0) return '';

  return `${cleanPrompt} ${cleanOptions
    .map((option, index) => `${index + 1}) ${option}`)
    .join(' ')}`.trim();
}

export function describeAnswerTransfer(
  fromType: string,
  toType: string,
  previousValue: string,
  nextValue: string,
) {
  const from = previousValue.trim();
  const to = nextValue.trim();
  if (!from || !to || from === to) return '';

  if (fromType === 'ege_multi_select' && toType === 'fill_blank') {
    return `Ответ преобразован: ${from} -> ${to}`;
  }

  if (fromType === 'fill_blank' && toType === 'ege_multi_select') {
    return `Ответ преобразован: ${from} -> ${to}`;
  }

  return '';
}

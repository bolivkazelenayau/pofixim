import type { FillBlankExercise } from './schemas';

export type Ege15QuickChoice = 'n' | 'nn';

export type Ege15QuickCard = {
  id: string;
  sourceExerciseId?: number;
  seedKey?: string | null;
  positionIndex?: number;
  token: string;
  context: string;
  correctChoice: Ege15QuickChoice;
  choices: ['Одна Н', 'НН'];
  correctChoiceIndex: 0 | 1;
  explanationSnippet?: string;
};

const NUMBERED_GAP_RE = /[\p{Script=Cyrillic}-]*\s?\(\d+\)[\p{Script=Cyrillic}-]*/gu;
const CYRILLIC_WORD_RE = /[\p{Script=Cyrillic}-]+/u;

export function buildEge15QuickCards(exercise: FillBlankExercise): Ege15QuickCard[] {
  if (!exercise.skillTags.includes('ege.15')) {
    return [];
  }

  const promptKind = getPromptKind(exercise.prompt);
  const text = stripMarkdown(`${exercise.payload.before}${exercise.payload.after}`);
  const cardsFromNumberedGaps = buildCardsFromNumberedGaps({
    exercise,
    text,
    promptKind,
  });

  if (cardsFromNumberedGaps.length > 0) {
    return cardsFromNumberedGaps;
  }

  return buildCardsFromSimpleFillBlank(exercise);
}

export function shuffleEge15QuickCards(
  cards: Ege15QuickCard[],
  seed = String(Date.now()),
): Ege15QuickCard[] {
  const result = [...cards];
  let state = hashString(seed) || 1;

  for (let i = result.length - 1; i > 0; i -= 1) {
    state = xorshift(state);
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function buildCardsFromNumberedGaps({
  exercise,
  text,
  promptKind,
}: {
  exercise: FillBlankExercise;
  text: string;
  promptKind: Ege15QuickChoice | null;
}) {
  if (!promptKind) return [];

  const targetSet = acceptedDigitSet(exercise.answer.accepted);
  if (targetSet.size === 0) return [];

  const cards: Ege15QuickCard[] = [];
  for (const match of text.matchAll(NUMBERED_GAP_RE)) {
    const token = normalizeSpaces(match[0]);
    const index = Number(token.match(/\((\d+)\)/u)?.[1]);
    if (!index) continue;

    const isTarget = targetSet.has(index);
    const correctChoice =
      promptKind === 'nn'
        ? isTarget ? 'nn' : 'n'
        : isTarget ? 'n' : 'nn';

    cards.push({
      id: `${exercise.seedKey ?? exercise.id ?? 'ege15'}-${index}-${hashString(token)}`,
      sourceExerciseId: exercise.id,
      seedKey: exercise.seedKey,
      positionIndex: index,
      token,
      context: extractContextAround(text, match.index ?? 0, token.length),
      correctChoice,
      choices: ['Одна Н', 'НН'],
      correctChoiceIndex: correctChoice === 'n' ? 0 : 1,
      explanationSnippet: extractExplanationSnippet(exercise.explanation, index),
    });
  }

  return cards;
}

function buildCardsFromSimpleFillBlank(exercise: FillBlankExercise): Ege15QuickCard[] {
  const accepted = exercise.answer.accepted
    .map((item) => normalizeNAnswer(item))
    .find((item): item is Ege15QuickChoice => item === 'n' || item === 'nn');

  if (!accepted) return [];

  const before = stripMarkdown(exercise.payload.before);
  const after = stripMarkdown(exercise.payload.after);
  const beforeTail = before.match(/[\p{Script=Cyrillic}-]+$/u)?.[0] ?? before;
  const afterHead = after.match(/^[\p{Script=Cyrillic}-]+/u)?.[0] ?? after;
  const token = normalizeSpaces(`${beforeTail}(?)${afterHead}`);
  const context = normalizeSpaces(`${before}(?)${after}`);

  if (!CYRILLIC_WORD_RE.test(token)) return [];

  return [
    {
      id: `${exercise.seedKey ?? exercise.id ?? 'ege15'}-single-${hashString(context)}`,
      sourceExerciseId: exercise.id,
      seedKey: exercise.seedKey,
      token,
      context,
      correctChoice: accepted,
      choices: ['Одна Н', 'НН'],
      correctChoiceIndex: accepted === 'n' ? 0 : 1,
      explanationSnippet: stripMarkdown(exercise.explanation) || undefined,
    },
  ];
}

function getPromptKind(prompt: string): Ege15QuickChoice | null {
  const clean = stripMarkdown(prompt);
  const upper = clean.toUpperCase();
  const lower = clean.toLowerCase();

  if (upper.includes('НН')) return 'nn';
  if (lower.includes('одна')) return 'n';
  if (/Н\s*(?:\.|$|[,:;!?])/u.test(upper)) return 'n';
  return null;
}

function acceptedDigitSet(accepted: string[]) {
  const signature = accepted.find((item) => /\d/u.test(item)) ?? '';
  return new Set([...signature].filter((char) => /\d/u.test(char)).map(Number));
}

function normalizeNAnswer(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
  if (normalized === 'н' || normalized === 'n') return 'n';
  if (normalized === 'нн' || normalized === 'nn') return 'nn';
  return null;
}

function extractContextAround(text: string, start: number, length: number) {
  const leftBoundary = Math.max(
    text.lastIndexOf('.', start),
    text.lastIndexOf('!', start),
    text.lastIndexOf('?', start),
    text.lastIndexOf(';', start),
  );
  const nextStops = ['.', '!', '?', ';']
    .map((stop) => text.indexOf(stop, start + length))
    .filter((index) => index >= 0);
  const rightBoundary = nextStops.length > 0 ? Math.min(...nextStops) + 1 : text.length;
  const context = text.slice(leftBoundary >= 0 ? leftBoundary + 1 : 0, rightBoundary);
  const clean = normalizeSpaces(context);

  if (clean.length <= 220) return clean;

  const tokenStart = Math.max(0, start - (leftBoundary >= 0 ? leftBoundary + 1 : 0));
  const from = Math.max(0, tokenStart - 90);
  const to = Math.min(clean.length, tokenStart + length + 90);
  return `${from > 0 ? '...' : ''}${clean.slice(from, to).trim()}${to < clean.length ? '...' : ''}`;
}

function extractExplanationSnippet(explanation: string, index: number) {
  const clean = stripMarkdown(explanation).replace(/<br\s*\/?>/giu, ' ');
  const rowRe = new RegExp(
    `(?:^|\\s)${index}\\)\\s*([\\s\\S]*?)(?=\\s+[1-9]\\)\\s*|$)`,
    'u',
  );
  const row = clean.match(rowRe)?.[1]?.trim();
  const value = row || clean;

  if (!value) return undefined;
  return value.length > 220 ? `${value.slice(0, 217).trim()}...` : value;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function xorshift(value: number) {
  let x = value >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

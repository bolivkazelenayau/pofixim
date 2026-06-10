import type { FillBlankExercise } from './schemas';
import { hashString, xorshift } from '@/lib/hash';

export type Ege15QuickChoice = 'n' | 'nn';

export type Ege15QuickCard = {
  id: string;
  sourceExerciseId?: number;
  seedKey?: string | null;
  positionIndex?: number;
  token: string;
  before: string;
  after: string;
  correctWord: string;
  context: string;
  correctChoice: Ege15QuickChoice;
  choices: ['Одна Н', 'НН'];
  correctChoiceIndex: 0 | 1;
  explanationSnippet?: string;
};

const NUMBERED_GAP_RE = /[\p{Script=Cyrillic}-]*\s?\(\d+\)[\p{Script=Cyrillic}-]*/gu;
const CYRILLIC_WORD_RE = /[\p{Script=Cyrillic}-]+/u;
const INVISIBLE_TEXT_RE = /[\u00ad\u200b\u200c\u200d\ufeff]/g;

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
    const tokenParts = splitNumberedGapToken(token);
    const correctWord = buildCorrectWord(tokenParts, correctChoice);

    cards.push({
      id: `${exercise.seedKey ?? exercise.id ?? 'ege15'}-${index}-${hashString(token)}`,
      sourceExerciseId: exercise.id,
      seedKey: exercise.seedKey,
      positionIndex: index,
      token,
      before: tokenParts.before,
      after: tokenParts.after,
      correctWord,
      context: extractContextAround(text, match.index ?? 0, token.length),
      correctChoice,
      choices: ['Одна Н', 'НН'],
      correctChoiceIndex: correctChoice === 'n' ? 0 : 1,
      explanationSnippet: extractExplanationSnippet(exercise.explanation, {
        index,
        correctWord,
      }),
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
  const correctWord = normalizeSpaces(`${beforeTail}${accepted === 'n' ? 'Н' : 'НН'}${afterHead}`);

  if (!CYRILLIC_WORD_RE.test(token)) return [];

  return [
    {
      id: `${exercise.seedKey ?? exercise.id ?? 'ege15'}-single-${hashString(context)}`,
      sourceExerciseId: exercise.id,
      seedKey: exercise.seedKey,
      token,
      before: beforeTail,
      after: afterHead,
      correctWord,
      context,
      correctChoice: accepted,
      choices: ['Одна Н', 'НН'],
      correctChoiceIndex: accepted === 'n' ? 0 : 1,
      explanationSnippet: extractExplanationSnippet(exercise.explanation, {
        correctWord,
      }),
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

function splitNumberedGapToken(token: string) {
  const marker = token.match(/\s?\(\d+\)/u);
  if (!marker || marker.index === undefined) {
    return { before: token, after: '' };
  }

  return {
    before: token.slice(0, marker.index).trimEnd(),
    after: token.slice(marker.index + marker[0].length).trimStart(),
  };
}

function buildCorrectWord(
  tokenParts: { before: string; after: string },
  correctChoice: Ege15QuickChoice,
) {
  const inserted = correctChoice === 'n' ? 'Н' : 'НН';
  return normalizeSpaces(`${tokenParts.before}${inserted}${tokenParts.after}`);
}

function extractContextAround(
  text: string,
  start: number,
  length: number,
) {
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
  const clean = normalizeSpaces(context).replace(/\(\d+\)/gu, '(?)');

  if (clean.length <= 260) return clean;

  const tokenStart = Math.max(0, start - (leftBoundary >= 0 ? leftBoundary + 1 : 0));
  const from = Math.max(0, tokenStart - 110);
  const to = Math.min(clean.length, tokenStart + length + 110);
  return `${from > 0 ? '...' : ''}${clean.slice(from, to).trim()}${to < clean.length ? '...' : ''}`;
}

function extractExplanationSnippet(
  explanation: string,
  target: { index?: number; correctWord?: string },
) {
  const clean = stripMarkdown(explanation).replace(/<br\s*\/?>/giu, ' ');
  const byWord = target.correctWord
    ? extractExplanationSnippetByWord(clean, target.correctWord)
    : undefined;
  if (byWord) return byWord;

  const row = target.index ? extractExplanationSnippetByIndex(clean, target.index) : undefined;
  const value = row || clean;

  if (!value) return undefined;
  return value.length > 220 ? `${value.slice(0, 217).trim()}...` : value;
}

function extractExplanationSnippetByIndex(clean: string, index: number) {
  const rowRe = new RegExp(
    `(?:^|\\s)${index}\\)\\s*([\\s\\S]*?)(?=\\s+[1-9]\\)\\s*|$)`,
    'u',
  );
  return clean.match(rowRe)?.[1]?.trim();
}

function extractExplanationSnippetByWord(clean: string, correctWord: string) {
  const haystack = comparableText(clean);
  const needle = comparableText(correctWord);
  if (!needle) return undefined;

  const matches: Array<{ index: number; score: number }> = [];
  let from = 0;
  while (from < haystack.length) {
    const foundAt = haystack.indexOf(needle, from);
    if (foundAt === -1) break;
    const after = clean.slice(foundAt + correctWord.length, foundAt + correctWord.length + 8);
    const before = clean.slice(Math.max(0, foundAt - 36), foundAt);
    const score =
      (/[—-]/u.test(after) ? 4 : 0) +
      (/в этом предложении[:\s]*$/iu.test(before) ? 2 : 0) +
      (/[,;:]\s*$/u.test(before) ? 1 : 0);
    matches.push({ index: foundAt, score });
    from = foundAt + Math.max(needle.length, 1);
  }

  const best = matches.sort((a, b) => b.score - a.score || b.index - a.index)[0];
  if (!best) return undefined;

  return trimExplanationSegment(clean, best.index, correctWord.length);
}

function trimExplanationSegment(clean: string, wordStart: number, wordLength: number) {
  const leftDelimiters = [';', '.', '!', '?', '\n'];
  const rightDelimiters = [';', '.', '!', '?', '\n'];
  const left = Math.max(...leftDelimiters.map((item) => clean.lastIndexOf(item, wordStart)));
  const rightCandidates = rightDelimiters
    .map((item) => clean.indexOf(item, wordStart + wordLength))
    .filter((index) => index >= 0);
  const right = rightCandidates.length > 0 ? Math.min(...rightCandidates) + 1 : clean.length;
  const segment = normalizeSpaces(clean.slice(left >= 0 ? left + 1 : 0, right));

  if (!segment) return undefined;
  return segment.length > 220 ? `${segment.slice(0, 217).trim()}...` : segment;
}

function comparableText(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е');
}

function stripMarkdown(value: string): string {
  return value
    .replace(INVISIBLE_TEXT_RE, '')
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



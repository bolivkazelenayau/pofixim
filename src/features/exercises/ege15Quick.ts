import type { FillBlankExercise } from './schemas';
import { hashString, xorshift } from '@/lib/hash';

export type Ege15QuickChoice = 'n' | 'nn';

export type Ege15QuickResolution =
  | {
      kind: 'numbered_gap';
      promptKind: Ege15QuickChoice;
      acceptedSource: 'digit_set';
    }
  | {
      kind: 'simple_fill_blank';
      promptKind: null;
      acceptedSource: 'direct_choice';
    };

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
  resolution: Ege15QuickResolution;
  explanationSnippet?: string;
};

export type Ege15QuickDiagnostics = {
  cards: Ege15QuickCard[];
  promptKind: Ege15QuickChoice | null;
  acceptedDigitPositions: number[];
  directAcceptedChoice: Ege15QuickChoice | null;
  positions: number[];
  numberedCount: number;
  simpleCount: number;
  skippedReasons: string[];
};

const NUMBERED_GAP_RE = /[\p{Script=Cyrillic}-]*\s?\(\d+\)\s?[\p{Script=Cyrillic}-]*/gu;
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

export function buildEge15QuickDiagnostics(exercise: FillBlankExercise): Ege15QuickDiagnostics {
  const text = stripMarkdown(`${exercise.payload.before}${exercise.payload.after}`);
  const cards = buildEge15QuickCards(exercise);
  const promptKind = getPromptKind(exercise.prompt);
  const acceptedDigits = acceptedDigitSet(exercise.answer.accepted);
  const directAcceptedChoice = getDirectAcceptedChoice(exercise.answer.accepted);
  const positions = extractNumberedPositions(text);
  const numberedCount = cards.filter((card) => card.resolution.kind === 'numbered_gap').length;
  const simpleCount = cards.length - numberedCount;
  const skippedReasons: string[] = [];

  if (!exercise.skillTags.includes('ege.15')) {
    skippedReasons.push('not_ege15');
  }
  if (positions.length > 0 && !promptKind) {
    skippedReasons.push('no_prompt_kind');
  }
  if (positions.length > 0 && acceptedDigits.size === 0) {
    skippedReasons.push('no_accepted_digits');
  }
  if (positions.length === 0 && !directAcceptedChoice) {
    skippedReasons.push('no_direct_n_answer');
  }
  if (cards.length === 0) {
    skippedReasons.push('no_cards');
  }

  return {
    cards,
    promptKind,
    acceptedDigitPositions: [...acceptedDigits],
    directAcceptedChoice,
    positions,
    numberedCount,
    simpleCount,
    skippedReasons,
  };
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
      context: extractContextAround(text, match.index ?? 0, token.length, index),
      correctChoice,
      choices: ['Одна Н', 'НН'],
      correctChoiceIndex: correctChoice === 'n' ? 0 : 1,
      resolution: {
        kind: 'numbered_gap',
        promptKind,
        acceptedSource: 'digit_set',
      },
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
      resolution: {
        kind: 'simple_fill_blank',
        promptKind: null,
        acceptedSource: 'direct_choice',
      },
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

function getDirectAcceptedChoice(accepted: string[]) {
  return accepted
    .map((item) => normalizeNAnswer(item))
    .find((item): item is Ege15QuickChoice => item === 'n' || item === 'nn') ?? null;
}

function extractNumberedPositions(value: string) {
  return [...value.matchAll(/\((\d+)\)/gu)].map((match) => Number(match[1]));
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
  activeIndex: number,
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
  const clean = normalizeSpaces(context).replace(
    new RegExp(`\\(${activeIndex}\\)`, 'gu'),
    '(?)',
  );

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
  const byIndex = target.index ? extractExplanationSnippetByIndex(clean, target.index) : undefined;
  if (byIndex) return byIndex;

  const byWord = target.correctWord
    ? extractExplanationSnippetByWord(clean, target.correctWord)
    : undefined;
  if (byWord) return byWord;

  return undefined;
}

function extractExplanationSnippetByIndex(clean: string, index: number) {
  const markerRe = new RegExp(`(?:^|[\\s;:])(?:${index}\\)|\\(${index}\\))\\s*`, 'gu');
  const matches = [...clean.matchAll(markerRe)];

  const candidates = matches
    .map((match) => {
      const markerStart = (match.index ?? 0) + (match[0].match(/^\s/u) ? 1 : 0);
      const segment = trimExplanationSegment(clean, markerStart, match[0].trim().length);
      return segment ? { index: markerStart, segment } : null;
    })
    .filter((item): item is { index: number; segment: string } => Boolean(item))
    .filter((item) => countPositionMarkers(item.segment) <= 2);

  return candidates.sort((a, b) => b.index - a.index)[0]?.segment;
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

  const segment = trimExplanationSegment(clean, best.index, correctWord.length);
  return segment && countPositionMarkers(segment) <= 2 ? segment : undefined;
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

function countPositionMarkers(value: string) {
  return value.match(/(?:^|\s)\d\)|\(\d+\)/gu)?.length ?? 0;
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



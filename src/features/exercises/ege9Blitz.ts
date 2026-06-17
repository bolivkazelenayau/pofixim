import type { EgeMultiSelectExercise } from './schemas';
import { hashString, xorshift } from '@/lib/hash';
import {
  findMaskedWordMatches,
  getDonorWordsOutsideParentheses,
  resolveBestUnusedDonorForMaskedWord,
} from './maskedWordResolver';

export type Ege9BlitzCard = {
  id: string;
  sourceExerciseId?: number;
  seedKey?: string | null;
  rowIndex: number;
  wordIndex: number;
  maskedWord: string;
  correctWord: string;
  contextHint?: string;
  before: string;
  missingLetter: string;
  after: string;
  choices: [string, string];
  correctChoiceIndex: 0 | 1;
  explanationSnippet?: string;
  resolution: Ege9BlitzResolution;
};

export type Ege9BlitzResolution = {
  kind: 'exact' | 'fuzzy';
  donorWord: string;
  displayMaskedWord: string;
  distance: number;
};

const NORMAL_POOL_MAX_FUZZY_DISTANCE = 1;

const CYRILLIC_LETTER_RE = /^[а-яё]$/iu;
const COMMON_DISTRACTORS: Record<string, string[]> = {
  а: ['о'],
  о: ['а'],
  е: ['и'],
  и: ['е'],
  я: ['е'],
  ё: ['о'],
  у: ['ю'],
  ю: ['у'],
  ы: ['и'],
  э: ['е'],
};
const SUPPORTED_BLITZ_LETTERS = new Set(Object.keys(COMMON_DISTRACTORS));
const HUSHING_CONSONANTS_RE = /[жчшщ]$/iu;

function isSupportedBlitzLetter(letter: string) {
  return SUPPORTED_BLITZ_LETTERS.has(letter.toLowerCase());
}

export function buildEge9BlitzCards(
  exercise: EgeMultiSelectExercise,
): Ege9BlitzCard[] {
  if (!exercise.skillTags.includes('ege.9')) {
    return [];
  }

  const explanationRows = extractExplanationRows(exercise.explanation);
  const fallbackDonors = getDonorWordsOutsideParentheses(exercise.explanation, stripMarkdown);
  const cards: Ege9BlitzCard[] = [];

  exercise.payload.options.slice(0, 5).forEach((optionLine, optionIndex) => {
    const rowIndex = optionIndex + 1;
    const explanationRow = explanationRows.get(rowIndex) ?? '';
    const donorWords = explanationRow
      ? getDonorWordsOutsideParentheses(explanationRow, stripMarkdown)
      : fallbackDonors;
    const usedDonorIndexes = new Set<number>();
    let wordIndex = 0;

    const cleanOptionLine = stripMarkdown(optionLine);

    for (const masked of findMaskedWordMatches(cleanOptionLine)) {
      wordIndex += 1;

      const resolution = resolveBestUnusedDonorForMaskedWord(
        masked.value,
        donorWords,
        usedDonorIndexes,
        { isMissingLetterCandidate: isSupportedBlitzLetter },
      );
      if (!resolution) continue;

      const missingLetter = resolution.gap.missingLetter.toLowerCase();
      if (!CYRILLIC_LETTER_RE.test(missingLetter)) continue;
      if (!SUPPORTED_BLITZ_LETTERS.has(missingLetter)) continue;
      const effectiveMissingLetter = normalizeContextualCorrectLetter(
        missingLetter,
        resolution.gap.before,
        resolution.gap.after,
      );
      if (!SUPPORTED_BLITZ_LETTERS.has(effectiveMissingLetter)) continue;

      const choices = buildChoices({
        correctLetter: effectiveMissingLetter,
        before: resolution.gap.before,
        after: resolution.gap.after,
        seed: `${exercise.seedKey}:${rowIndex}:${wordIndex}`,
      });
      const correctChoiceIndex = choices[0] === effectiveMissingLetter ? 0 : 1;

      cards.push({
        id: `${exercise.seedKey ?? exercise.id ?? 'ege9'}-${rowIndex}-${wordIndex}-${masked.start}`,
        sourceExerciseId: exercise.id,
        seedKey: exercise.seedKey,
        rowIndex,
        wordIndex,
        maskedWord: masked.value,
        correctWord: resolution.donorWord,
        contextHint: extractContextHintAfterMatch(cleanOptionLine, masked.end),
        before: resolution.gap.before,
        missingLetter: effectiveMissingLetter,
        after: resolution.gap.after,
        choices,
        correctChoiceIndex,
        explanationSnippet: explanationRow || undefined,
        resolution: {
          kind: resolution.gap.kind,
          donorWord: resolution.donorWord,
          displayMaskedWord: masked.value,
          distance: resolution.gap.distance,
        },
      });
    }
  });

  return cards;
}

export function shuffleBlitzCards(
  cards: Ege9BlitzCard[],
  seed = String(Date.now()),
): Ege9BlitzCard[] {
  const result = [...cards];
  let state = hashString(seed) || 1;

  for (let i = result.length - 1; i > 0; i -= 1) {
    state = xorshift(state);
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

export function isEge9BlitzCardEligibleForNormalPool(card: Ege9BlitzCard) {
  return (
    card.resolution.kind === 'exact' ||
    card.resolution.distance <= NORMAL_POOL_MAX_FUZZY_DISTANCE
  );
}

function extractExplanationRows(explanation: string) {
  const clean = stripMarkdown(explanation)
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const rows = new Map<number, string>();
  const rowRe = /(?:^|\s)([1-5])\)\s*([\s\S]*?)(?=\s+[1-5]\)\s*|$)/gu;

  for (const match of clean.matchAll(rowRe)) {
    const rowIndex = Number(match[1]);
    const rowText = String(match[2] ?? '').trim();
    if (rowIndex >= 1 && rowIndex <= 5 && rowText) {
      rows.set(rowIndex, rowText);
    }
  }

  return rows;
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

function extractContextHintAfterMatch(value: string, matchEnd: number) {
  const rest = value.slice(matchEnd);
  const match = rest.match(/^\s*\(([^)]+)\)/u);
  const context = match?.[1]?.replace(/\s+/g, ' ').trim();
  return context || undefined;
}

function buildChoices({
  correctLetter,
  before,
  after,
  seed,
}: {
  correctLetter: string;
  before: string;
  after: string;
  seed: string;
}): [string, string] {
  const normalizedCorrectLetter = normalizeContextualCorrectLetter(
    correctLetter,
    before,
    after,
  );
  const distractorPool = getContextualDistractors(normalizedCorrectLetter, before, after)
    .filter((letter) => letter !== normalizedCorrectLetter);
  const distractor = distractorPool[hashString(seed) % distractorPool.length] ?? 'о';
  const choices: [string, string] = [normalizedCorrectLetter, distractor];

  if (hashString(`${seed}:side`) % 2 === 1) {
    return [choices[1], choices[0]];
  }

  return choices;
}

function normalizeContextualCorrectLetter(
  correctLetter: string,
  before: string,
  after: string,
) {
  if (HUSHING_CONSONANTS_RE.test(before) && isLikelyForeignOAfterHushing(after)) {
    return 'о';
  }

  return correctLetter;
}

function getContextualDistractors(correctLetter: string, before: string, after: string) {
  if (
    correctLetter === 'о' &&
    HUSHING_CONSONANTS_RE.test(before) &&
    isLikelyForeignOAfterHushing(after)
  ) {
    return ['а'];
  }

  if (correctLetter === 'о' && HUSHING_CONSONANTS_RE.test(before)) {
    return ['ё'];
  }

  return COMMON_DISTRACTORS[correctLetter] ?? ['о'];
}

function isLikelyForeignOAfterHushing(after: string) {
  return /^(?:кей|кет|колад|колат|кол|ссе|рты|рник|рный|рство)/iu.test(after);
}



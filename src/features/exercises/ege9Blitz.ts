import type { EgeMultiSelectExercise } from './schemas';
import { hashString, xorshift } from '@/lib/hash';

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
};

const MASKED_WORD_RE =
  /[\p{L}-]*(?:\.{2,}|\u2026+|_+|(?<=[\p{L}])\.(?=[\p{L}]))[\p{L}-]*/gu;
const GAP_RE = /(?:\.{2,}|\u2026+|_+|(?<=\p{L})\.(?=\p{L}))/u;
const SPLIT_GAP_RE = /(?:\.{2,}|\u2026+|_+|(?<=\p{L})\.(?=\p{L}))/gu;
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
const HUSHING_CONSONANTS_RE = /[жчшщ]$/iu;

export function buildEge9BlitzCards(
  exercise: EgeMultiSelectExercise,
): Ege9BlitzCard[] {
  if (!exercise.skillTags.includes('ege.9')) {
    return [];
  }

  const explanationRows = extractExplanationRows(exercise.explanation);
  const fallbackDonors = getDonorWordsOutsideParentheses(exercise.explanation);
  const cards: Ege9BlitzCard[] = [];

  exercise.payload.options.slice(0, 5).forEach((optionLine, optionIndex) => {
    const rowIndex = optionIndex + 1;
    const explanationRow = explanationRows.get(rowIndex) ?? '';
    const donorWords = explanationRow
      ? getDonorWordsOutsideParentheses(explanationRow)
      : fallbackDonors;
    const usedDonorIndexes = new Set<number>();
    let wordIndex = 0;

    const cleanOptionLine = stripMarkdown(optionLine);

    for (const masked of findMaskedWordMatches(cleanOptionLine)) {
      wordIndex += 1;

      const donorWord = findBestUnusedDonorWordForMaskedWord(
        masked.value,
        donorWords,
        usedDonorIndexes,
      );
      if (!donorWord) continue;

      const gap = extractSingleLetterGap(masked.value, donorWord);
      if (!gap) continue;

      const missingLetter = gap.missingLetter.toLowerCase();
      if (!CYRILLIC_LETTER_RE.test(missingLetter)) continue;

      const choices = buildChoices({
        correctLetter: missingLetter,
        before: gap.before,
        seed: `${exercise.seedKey}:${rowIndex}:${wordIndex}`,
      });
      const correctChoiceIndex = choices[0] === missingLetter ? 0 : 1;

      cards.push({
        id: `${exercise.seedKey ?? exercise.id ?? 'ege9'}-${rowIndex}-${wordIndex}-${masked.start}`,
        sourceExerciseId: exercise.id,
        seedKey: exercise.seedKey,
        rowIndex,
        wordIndex,
        maskedWord: masked.value,
        correctWord: donorWord,
        contextHint: extractContextHintAfterMatch(cleanOptionLine, masked.end),
        before: gap.before,
        missingLetter,
        after: gap.after,
        choices,
        correctChoiceIndex,
        explanationSnippet: explanationRow || undefined,
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

function getDonorWordsOutsideParentheses(value: string): string[] {
  const withoutParentheses = stripMarkdown(value).replace(/\([^)]*\)/g, ' ');
  return withoutParentheses.match(/[\p{L}-]+/gu) ?? [];
}

function findMaskedWordMatches(value: string) {
  const result: Array<{ value: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = MASKED_WORD_RE.exec(value)) !== null) {
    result.push({
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  MASKED_WORD_RE.lastIndex = 0;
  return result;
}

function extractContextHintAfterMatch(value: string, matchEnd: number) {
  const rest = value.slice(matchEnd);
  const match = rest.match(/^\s*\(([^)]+)\)/u);
  const context = match?.[1]?.replace(/\s+/g, ' ').trim();
  return context || undefined;
}

function findBestUnusedDonorWordForMaskedWord(
  maskedWord: string,
  donorWords: string[],
  usedDonorIndexes: Set<number>,
) {
  const knownParts = maskedWord.split(SPLIT_GAP_RE).filter(Boolean);

  for (let i = 0; i < donorWords.length; i += 1) {
    if (usedDonorIndexes.has(i)) continue;

    const donorWord = donorWords[i];
    if (extractSingleLetterGap(maskedWord, donorWord)) {
      usedDonorIndexes.add(i);
      return donorWord;
    }

    let cursor = 0;
    let matches = true;

    for (const part of knownParts) {
      const foundAt = donorWord.toLowerCase().indexOf(part.toLowerCase(), cursor);
      if (foundAt === -1) {
        matches = false;
        break;
      }
      cursor = foundAt + part.length;
    }

    if (matches) {
      usedDonorIndexes.add(i);
      return donorWord;
    }
  }

  return null;
}

function extractSingleLetterGap(maskedWord: string, donorWord: string) {
  if (!GAP_RE.test(maskedWord)) return null;

  const parts = maskedWord.split(SPLIT_GAP_RE);
  if (parts.length !== 2) return null;

  const [before, after] = parts;
  const lowerDonor = donorWord.toLowerCase();
  const lowerBefore = before.toLowerCase();
  const lowerAfter = after.toLowerCase();

  if (!lowerDonor.startsWith(lowerBefore) || !lowerDonor.endsWith(lowerAfter)) {
    const fuzzyGap = extractSingleLetterGapFuzzy(
      before,
      after,
      donorWord,
    );
    if (fuzzyGap) return fuzzyGap;
    return null;
  }

  const missingStart = before.length;
  const missingEnd = donorWord.length - after.length;
  const missingLetter = donorWord.slice(missingStart, missingEnd);

  if ([...missingLetter].length !== 1) return null;

  return {
    before,
    missingLetter,
    after,
  };
}

function extractSingleLetterGapFuzzy(
  before: string,
  after: string,
  donorWord: string,
) {
  const donorLetters = [...donorWord];
  const beforeLength = [...before].length;
  let best:
    | { index: number; distance: number }
    | null = null;

  for (let index = 1; index < donorLetters.length; index += 1) {
    const donorBefore = donorLetters.slice(0, index).join('');
    const donorAfter = donorLetters.slice(index + 1).join('');
    const beforeDistance = boundedEditDistance(
      before.toLowerCase(),
      donorBefore.toLowerCase(),
      1,
    );
    if (beforeDistance === null) continue;

    const afterDistance = boundedEditDistance(
      after.toLowerCase(),
      donorAfter.toLowerCase(),
      2,
    );
    if (afterDistance === null) continue;

    const distance = beforeDistance + afterDistance;
    if (distance > 3) continue;
    if (Math.abs(beforeLength - index) > 1) continue;

    if (!best || distance < best.distance) {
      best = { index, distance };
    }
  }

  if (!best) return null;

  return {
    before,
    missingLetter: donorLetters[best.index],
    after,
  };
}

function boundedEditDistance(left: string, right: string, maxDistance: number) {
  const leftLetters = [...left];
  const rightLetters = [...right];
  if (Math.abs(leftLetters.length - rightLetters.length) > maxDistance) {
    return null;
  }

  let previous = Array.from({ length: rightLetters.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= leftLetters.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMin = current[0];

    for (let rightIndex = 1; rightIndex <= rightLetters.length; rightIndex += 1) {
      const cost = leftLetters[leftIndex - 1] === rightLetters[rightIndex - 1] ? 0 : 1;
      const next = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost,
      );
      current[rightIndex] = next;
      rowMin = Math.min(rowMin, next);
    }

    if (rowMin > maxDistance) return null;
    previous = current;
  }

  const distance = previous[rightLetters.length];
  return distance <= maxDistance ? distance : null;
}

function buildChoices({
  correctLetter,
  before,
  seed,
}: {
  correctLetter: string;
  before: string;
  seed: string;
}): [string, string] {
  const distractorPool = getContextualDistractors(correctLetter, before)
    .filter((letter) => letter !== correctLetter);
  const distractor = distractorPool[hashString(seed) % distractorPool.length] ?? 'о';
  const choices: [string, string] = [correctLetter, distractor];

  if (hashString(`${seed}:side`) % 2 === 1) {
    return [choices[1], choices[0]];
  }

  return choices;
}

function getContextualDistractors(correctLetter: string, before: string) {
  if (correctLetter === 'о' && HUSHING_CONSONANTS_RE.test(before)) {
    return ['ё'];
  }

  return COMMON_DISTRACTORS[correctLetter] ?? ['о'];
}



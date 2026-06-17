export type MaskedWordMatch = {
  value: string;
  start: number;
  end: number;
};

export type MaskedWordResolutionKind = 'exact' | 'fuzzy';

export type MaskedWordGapResolution = {
  before: string;
  missingLetter: string;
  after: string;
  kind: MaskedWordResolutionKind;
  distance: number;
};

export type MaskedWordResolution = {
  donorWord: string;
  gap: MaskedWordGapResolution;
};

type ResolveOptions = {
  allowFuzzy?: boolean;
  isMissingLetterCandidate?: (letter: string) => boolean;
};

const MASKED_WORD_RE =
  /[\p{L}-]*(?:(?:\.{2,}|\u2026+|_+)\s*|(?<=[\p{L}])\.(?=[\p{L}]))[\p{L}-]*/gu;
const GAP_RE = /(?:(?:\.{2,}|\u2026+|_+)\s*|(?<=\p{L})\.(?=\p{L}))/u;
const SPLIT_GAP_RE = /(?:(?:\.{2,}|\u2026+|_+)\s*|(?<=\p{L})\.(?=\p{L}))/gu;
const CYRILLIC_LETTER_RE = /^[а-яё]$/iu;

export function findMaskedWordMatches(value: string): MaskedWordMatch[] {
  const result: MaskedWordMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = MASKED_WORD_RE.exec(value)) !== null) {
    result.push({
      value: normalizeMaskedWord(match[0]),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  MASKED_WORD_RE.lastIndex = 0;
  return result;
}

export function getDonorWordsOutsideParentheses(
  value: string,
  stripMarkup: (value: string) => string,
): string[] {
  const withoutParentheses = stripMarkup(value).replace(/\([^)]*\)/g, ' ');
  return withoutParentheses.match(/[\p{L}-]+/gu) ?? [];
}

export function resolveBestUnusedDonorForMaskedWord(
  maskedWord: string,
  donorWords: string[],
  usedDonorIndexes: Set<number>,
  options: ResolveOptions = {},
): MaskedWordResolution | null {
  const knownParts = maskedWord.split(SPLIT_GAP_RE).filter(Boolean);

  for (let i = 0; i < donorWords.length; i += 1) {
    if (usedDonorIndexes.has(i)) continue;

    const donorWord = donorWords[i];
    const gap = resolveSingleLetterGap(maskedWord, donorWord, {
      ...options,
      allowFuzzy: false,
    });
    if (gap) {
      usedDonorIndexes.add(i);
      return { donorWord, gap };
    }
  }

  for (let i = 0; i < donorWords.length; i += 1) {
    if (usedDonorIndexes.has(i)) continue;

    const donorWord = donorWords[i];
    const gap = resolveSingleLetterGap(maskedWord, donorWord, options);
    if (gap) {
      usedDonorIndexes.add(i);
      return { donorWord, gap };
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
      const subsequenceGap = resolveSingleLetterGap(maskedWord, donorWord, options);
      if (subsequenceGap) {
        usedDonorIndexes.add(i);
        return { donorWord, gap: subsequenceGap };
      }
    }
  }

  return null;
}

export function renderMaskedWordResolutionWithBold(resolution: MaskedWordResolution) {
  const { before, missingLetter, after } = resolution.gap;
  return `${before}**${missingLetter}**${after}`;
}

function normalizeMaskedWord(value: string) {
  return value.replace(/(\.{2,}|\u2026+|_+)\s+(?=[\p{L}-])/gu, '$1');
}

function resolveSingleLetterGap(
  maskedWord: string,
  donorWord: string,
  options: ResolveOptions = {},
): MaskedWordGapResolution | null {
  if (!GAP_RE.test(maskedWord)) return null;

  const parts = maskedWord.split(SPLIT_GAP_RE);
  if (parts.length !== 2) return null;

  const [before, after] = parts;
  const lowerDonor = donorWord.toLowerCase();
  const lowerBefore = before.toLowerCase();
  const lowerAfter = after.toLowerCase();

  if (!lowerDonor.startsWith(lowerBefore) || !lowerDonor.endsWith(lowerAfter)) {
    if (options.allowFuzzy === false) return null;

    const fuzzyGap = resolveSingleLetterGapFuzzy(before, after, donorWord, options);
    if (fuzzyGap) return fuzzyGap;
    return null;
  }

  const missingStart = before.length;
  const missingEnd = donorWord.length - after.length;
  const missingLetter = donorWord.slice(missingStart, missingEnd);
  const missingLetters = [...missingLetter];

  if (missingLetters.length !== 1) {
    const split = splitExpandedGap(missingLetter, options);
    if (!split) return null;

    return {
      before,
      missingLetter: split.missingLetter,
      after: `${split.remainder}${after}`,
      kind: 'exact',
      distance: 0,
    };
  }

  if (!isAllowedMissingLetter(missingLetter, options)) return null;

  return {
    before,
    missingLetter,
    after,
    kind: 'exact',
    distance: 0,
  };
}

function resolveSingleLetterGapFuzzy(
  before: string,
  after: string,
  donorWord: string,
  options: ResolveOptions,
): MaskedWordGapResolution | null {
  const donorLetters = [...donorWord];
  const beforeLength = [...before].length;
  let best: { index: number; distance: number } | null = null;

  for (let index = 1; index < donorLetters.length; index += 1) {
    if (!isAllowedMissingLetter(donorLetters[index], options)) {
      continue;
    }

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
      4,
    );
    if (afterDistance === null) continue;

    const distance = beforeDistance + afterDistance;
    if (distance > 4) continue;
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
    kind: 'fuzzy',
    distance: best.distance,
  };
}

function splitExpandedGap(value: string, options: ResolveOptions) {
  const letters = [...value];
  const missingIndex = letters.findIndex((letter) => isAllowedMissingLetter(letter, options));

  if (missingIndex === -1) return null;

  return {
    missingLetter: letters[missingIndex],
    remainder: `${letters.slice(0, missingIndex).join('')}${letters.slice(missingIndex + 1).join('')}`,
  };
}

function isAllowedMissingLetter(letter: string, options: ResolveOptions) {
  const lower = letter.toLowerCase();
  if (!CYRILLIC_LETTER_RE.test(lower)) return false;
  return options.isMissingLetterCandidate ? options.isMissingLetterCandidate(lower) : true;
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

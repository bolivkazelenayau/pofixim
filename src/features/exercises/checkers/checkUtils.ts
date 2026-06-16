import type {
  PunctuationConstructorExercise,
  PunctuationInsertExercise,
  SubmittedAnswer,
} from '../schemas';
import type { CheckMistake } from '../types';

export type DictationDiffItem =
  | { kind: 'equal'; expected: string; actual: string }
  | { kind: 'missing'; expected: string }
  | { kind: 'extra'; actual: string }
  | { kind: 'replace'; expected: string; actual: string };

export function normalizeDictationText(value: string, caseSensitive = false) {
  const normalized = value
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[«»“”„]/g, '"')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return caseSensitive ? normalized : normalized.toLowerCase();
}

export function tokenizeDictationText(value: string, ignorePunctuation = false) {
  const tokens = value.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*|[.,!?;:"()]/gu) ?? [];
  return ignorePunctuation ? tokens.filter((token) => /[\p{L}\p{N}]/u.test(token)) : tokens;
}

export function diffTokens(
  expected: string[],
  actual: string[],
  expectedDisplay = expected,
  actualDisplay = actual,
): DictationDiffItem[] {
  const dp = Array.from({ length: expected.length + 1 }, () =>
    Array<number>(actual.length + 1).fill(0),
  );

  for (let i = 0; i <= expected.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= actual.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= expected.length; i += 1) {
    for (let j = 1; j <= actual.length; j += 1) {
      const cost = expected[i - 1] === actual[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  const result: DictationDiffItem[] = [];
  let i = expected.length;
  let j = actual.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expected[i - 1] === actual[j - 1]) {
      result.push({
        kind: 'equal',
        expected: expectedDisplay[i - 1],
        actual: actualDisplay[j - 1],
      });
      i -= 1;
      j -= 1;
    } else if (
      i > 0 &&
      j > 0 &&
      dp[i][j] === dp[i - 1][j - 1] + 1
    ) {
      result.push({
        kind: 'replace',
        expected: expectedDisplay[i - 1],
        actual: actualDisplay[j - 1],
      });
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      result.push({ kind: 'missing', expected: expectedDisplay[i - 1] });
      i -= 1;
    } else if (j > 0) {
      result.push({ kind: 'extra', actual: actualDisplay[j - 1] });
      j -= 1;
    } else {
      break;
    }
  }

  return result.reverse();
}

export function normalizeText(value: string, caseSensitive = false) {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

export function normalizeMarks(marks: PunctuationInsertExercise['answer']['marks']) {
  return [...marks]
    .sort(sortMarks)
    .map((mark) => `${mark.afterTokenIndex}:${mark.mark}`)
    .join('|');
}

export function sortMarks(
  a: PunctuationInsertExercise['answer']['marks'][number],
  b: PunctuationInsertExercise['answer']['marks'][number],
) {
  return a.afterTokenIndex === b.afterTokenIndex
    ? a.mark.localeCompare(b.mark)
    : a.afterTokenIndex - b.afterTokenIndex;
}

export function buildPunctuationMistakes(
  exercise: PunctuationInsertExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'punctuation_insert' }>,
): CheckMistake[] {
  const expected = new Set(
    exercise.answer.marks.map((mark) => `${mark.afterTokenIndex}:${mark.mark}`),
  );
  const submitted = new Set(
    submittedAnswer.marks.map((mark) => `${mark.afterTokenIndex}:${mark.mark}`),
  );
  const missing = [...expected].filter((mark) => !submitted.has(mark));
  const extra = [...submitted].filter((mark) => !expected.has(mark));

  return [
    ...missing.map((target) => ({
      kind: 'missing_punctuation',
      message: 'Expected punctuation mark was not placed.',
      target,
    })),
    ...extra.map((target) => ({
      kind: 'extra_punctuation',
      message: 'Unexpected punctuation mark was placed.',
      target,
    })),
  ];
}

export function punctuationConstructorGlyph(
  mark: PunctuationConstructorExercise['answer']['placements'][number]['mark'],
) {
  const glyphs = {
    comma: ',',
    colon: ':',
    semicolon: ';',
    dash: '—',
    quote_open: '«',
    quote_close: '»',
    paren_open: '(',
    paren_close: ')',
    period: '.',
    exclamation: '!',
    question: '?',
    ellipsis: '...',
  } satisfies Record<
    PunctuationConstructorExercise['answer']['placements'][number]['mark'],
    string
  >;

  return glyphs[mark];
}

export function normalizeConstructorPlacements(
  placements: PunctuationConstructorExercise['answer']['placements'],
) {
  return placements
    .map((placement) => `${placement.slotIndex}:${placement.mark}`)
    .join('|');
}

export function renderConstructorSentence(
  tokens: string[],
  placements: PunctuationConstructorExercise['answer']['placements'],
) {
  const parts: string[] = [];

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const beforeMarks = placements
      .filter((placement) => placement.slotIndex === tokenIndex)
      .map((placement) => punctuationConstructorGlyph(placement.mark))
      .join('');

    if (beforeMarks) {
      parts.push(beforeMarks);
    }
    parts.push(tokens[tokenIndex]);
  }

  const tailMarks = placements
    .filter((placement) => placement.slotIndex === tokens.length)
    .map((placement) => punctuationConstructorGlyph(placement.mark))
    .join('');

  if (tailMarks) {
    parts.push(tailMarks);
  }

  return parts
    .join(' ')
    .replace(/\s+([,;:.!?»])/g, '$1')
    .replace(/([:;])«/g, '$1 «')
    .trim();
}

export function buildConstructorMistakes(
  exercise: PunctuationConstructorExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'punctuation_constructor' }>,
): CheckMistake[] {
  const expected = exercise.answer.placements.map(
    (placement) => `${placement.slotIndex}:${placement.mark}`,
  );
  const submitted = submittedAnswer.placements.map(
    (placement) => `${placement.slotIndex}:${placement.mark}`,
  );

  const remainingSubmitted = [...submitted];
  const missing: string[] = [];

  for (const target of expected) {
    const foundAt = remainingSubmitted.indexOf(target);
    if (foundAt >= 0) {
      remainingSubmitted.splice(foundAt, 1);
    } else {
      missing.push(target);
    }
  }

  return [
    ...missing.map((target) => ({
      kind: 'missing_punctuation_constructor_mark',
      message: 'Expected constructor mark was not placed.',
      target,
    })),
    ...remainingSubmitted.map((target) => ({
      kind: 'extra_punctuation_constructor_mark',
      message: 'Unexpected constructor mark was placed.',
      target,
    })),
  ];
}

export function parseEge21Set(value: string): number[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (/[,\s;|/.\-]/.test(trimmed)) {
    return normalizeIndexSet(
      trimmed
        .split(/[^\d]+/)
        .map((part) => Number(part))
        .filter((num) => Number.isInteger(num) && num > 0),
    );
  }

  return normalizeIndexSet(
    trimmed
      .split('')
      .map((char) => Number(char))
      .filter((num) => Number.isInteger(num) && num > 0),
  );
}

export function normalizeIndexSet(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function serializeIndexSet(values: number[]): string {
  return values.join(',');
}

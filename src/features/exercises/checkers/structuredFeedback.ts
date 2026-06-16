import { normalizeNumberAnswerSignature } from '@/lib/exercise-type-conversion';
import type { EgeMultiSelectExercise, Exercise } from '../schemas';

export function extractStructuredFeedback(
  exercise: Exercise,
): { correctAnswer: string; detailedExplanation: string } | null {
  if (exercise.type === 'dictation') {
    return {
      correctAnswer: exercise.answer.text,
      detailedExplanation: exercise.explanation,
    };
  }

  if (exercise.type === 'fill_blank' && exercise.skillTags.includes('ege.18')) {
    const correctAnswer = [
      ...new Set(
        exercise.answer.accepted
          .map((value) => normalizeNumberAnswerSignature(value) || value.trim())
          .filter(Boolean),
      ),
    ].join('\n\n');
    const detailedExplanation = exercise.explanation.trim();
    if (correctAnswer && detailedExplanation) {
      return { correctAnswer, detailedExplanation };
    }
    return null;
  }

  if (exercise.type !== 'ege_multi_select') return null;
  const isEge10 = exercise.skillTags.includes('ege.10');
  const isEge9 = exercise.skillTags.includes('ege.9');
  const isEge11 = exercise.skillTags.includes('ege.11');
  const feedback = exercise.payload.feedback;
  const hasStructuredRows = Object.keys(extractRowsFromExplanation(exercise.explanation)).length > 0;

  if (isEge10 || isEge9 || isEge11 || hasStructuredRows) {
    const correctAnswerLines = buildCorrectAnswerDisplayRows(exercise);
    if (correctAnswerLines.length > 0) {
      const detailedExplanation = feedback?.explanation
        ?.map((line) => String(line ?? '').trim())
        .filter(Boolean)
        .join('\n') || exercise.explanation;
      return {
        correctAnswer: correctAnswerLines.join('\n\n'),
        detailedExplanation,
      };
    }
  }

  if (!feedback) return null;

  const correctAnswer = feedback.correctAnswer
    .map((line) => String(line ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
  const detailedExplanation = feedback.explanation
    .map((line) => String(line ?? '').trim())
    .filter(Boolean)
    .join('\n');

  if (!correctAnswer || !detailedExplanation) return null;
  return { correctAnswer, detailedExplanation };
}

function buildCorrectAnswerDisplayRows(exercise: EgeMultiSelectExercise): string[] {
  const rowsByIndex = extractRowsFromExplanation(exercise.explanation);

  const optionSkeletons = Array.isArray(exercise.payload.options)
    ? exercise.payload.options
    : [];

  const rows = [...new Set(exercise.answer.targetSet)]
    .sort((a, b) => a - b)
    .map((index) => {
      const fallback = optionSkeletons[index - 1];
      const fromExplanation = rowsByIndex[index];
      const optionBase = stripMarkdown(String(fallback ?? '').trim());
      if (!fromExplanation) return optionBase;

      const merged = fillGapsInOptionRowWithBold(optionBase, fromExplanation);
      const displayRow = merged || optionBase;
      if (/(?:\.\.|…|_)/u.test(displayRow)) {
        console.warn('correctAnswerDisplay still has gaps', {
          displayRow,
          optionRow: optionBase,
          explanationRow: fromExplanation,
        });
      }
      return displayRow;
    })
    .filter(Boolean);

  if (exercise.seedKey === 'ege11-bank-18210' || exercise.id === 18210) {
    console.debug('correctAnswerDisplay debug ege11-bank-18210', {
      exerciseId: exercise.id,
      seedKey: exercise.seedKey,
      targetSet: exercise.answer.targetSet,
      optionSkeletons,
      extractedRows: rowsByIndex,
      displayRows: rows,
    });
  }

  return rows;
}

function extractRowsFromExplanation(explanation: string): Record<number, string> {
  const result: Record<number, string> = {};
  const normalizedExplanation = explanation.replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '');
  const rowStartRegex = /(?:^|\r?\n)\s*(?:\*\*)?Ряд\s*([1-5])(?:\*\*)?\s*:/giu;
  const starts: Array<{ rowNumber: number; index: number; markerEnd: number }> = [];
  let startMatch: RegExpExecArray | null;
  while ((startMatch = rowStartRegex.exec(normalizedExplanation)) !== null) {
    if (startMatch.index == null) continue;
    starts.push({
      rowNumber: Number(startMatch[1]),
      index: startMatch.index,
      markerEnd: rowStartRegex.lastIndex,
    });
  }

  for (let i = 0; i < starts.length; i++) {
    const current = starts[i];
    const next = starts[i + 1];
    const block = normalizedExplanation.slice(current.markerEnd, next ? next.index : normalizedExplanation.length);
    let header = block;
    const dashSeparatorIndex = block.search(/\s[—-]\s/u);
    if (dashSeparatorIndex >= 0) {
      const colonIndex = block.indexOf(':', dashSeparatorIndex);
      if (colonIndex > dashSeparatorIndex && colonIndex - dashSeparatorIndex <= 80) {
        header = block.slice(0, dashSeparatorIndex);
      }
    }
    const rowHeader = stripMarkdown(header).trim();
    if (rowHeader) {
      result[current.rowNumber] = rowHeader;
    }
  }

  return result;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function fillGapsInOptionRowWithBold(optionLine: string, explanationRowText: string) {
  const donorWords = getDonorWordsOutsideParentheses(explanationRowText);

  return replaceMaskedWordsInText(optionLine, donorWords)
    .replace(/\s+([,;:])/g, '$1')
    .replace(/,\s*/g, ', ')
    .trim();
}

function replaceMaskedWordsInText(optionText: string, donorWords: string[]): string {
  const optionClean = stripMarkdown(optionText).trim();
  const maskedMatches = findMaskedWordMatches(optionClean);

  if (maskedMatches.length === 0) return optionClean;
  if (donorWords.length === 0) {
    console.warn('correctAnswerDisplay: no donor words', { optionText });
    return optionClean;
  }

  let result = optionClean;
  let offset = 0;
  const usedDonorIndexes = new Set<number>();

  for (const maskedMatch of maskedMatches) {
    const donorWord = findBestUnusedDonorWordForMaskedWord(
      maskedMatch.value,
      donorWords,
      usedDonorIndexes,
    );

    if (!donorWord) {
      console.warn('No donor word for masked word', {
        maskedWord: maskedMatch.value,
        donorWords,
        optionText,
      });
      continue;
    }

    const filledWord = fillMaskedWordWithBold(maskedMatch.value, donorWord);
    const start = maskedMatch.start + offset;
    const end = maskedMatch.end + offset;
    result = result.slice(0, start) + filledWord + result.slice(end);
    offset += filledWord.length - maskedMatch.value.length;
  }

  return result;
}

function findMaskedWordMatches(value: string): Array<{ value: string; start: number; end: number }> {
  const regex = /[\p{L}-]*(?:\.{2,}|\u2026+|_+|(?<=[\p{L}])\.(?=[\p{L}]))[\p{L}-]*/gu;
  const result: Array<{ value: string; start: number; end: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    if (match.index == null) continue;
    result.push({
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return result;
}

function getDonorWordsOutsideParentheses(value: string): string[] {
  const withoutParentheses = stripMarkdown(value).replace(/\([^)]*\)/g, ' ');
  return withoutParentheses.match(/[\p{L}-]+/gu) ?? [];
}

function findBestUnusedDonorWordForMaskedWord(
  maskedWord: string,
  donorWords: string[],
  usedDonorIndexes: Set<number>,
): string | null {
  const knownParts = maskedWord
    .split(/\.{2,}|\u2026+|_+/u)
    .filter(Boolean);

  for (let i = 0; i < donorWords.length; i++) {
    if (usedDonorIndexes.has(i)) continue;
    const donorWord = donorWords[i];
    let cursor = 0;
    let matches = true;
    for (const part of knownParts) {
      const foundAt = donorWord.indexOf(part, cursor);
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

function fillMaskedWordWithBold(maskedWord: string, donorWord: string): string {
  const gapRegex = /(?:\.{2,}|\u2026+|_+|(?<=\p{L})\.(?=\p{L}))/u;
  if (!gapRegex.test(maskedWord)) {
    return maskedWord;
  }

  const splitGapRegex = /(?:\.{2,}|\u2026+|_+|(?<=\p{L})\.(?=\p{L}))/gu;
  const parts = maskedWord.split(splitGapRegex);

  let result = parts[0];
  let cursor = parts[0].length;

  if (!donorWord.startsWith(parts[0])) {
    return donorWord;
  }

  for (let i = 1; i < parts.length; i++) {
    const nextKnownPart = parts[i];
    const nextIndex = nextKnownPart
      ? donorWord.indexOf(nextKnownPart, cursor)
      : donorWord.length;

    if (nextIndex === -1) {
      return donorWord;
    }

    const missingLetters = donorWord.slice(cursor, nextIndex);
    if (missingLetters.length > 0) {
      result += `**${missingLetters}**`;
    }
    result += nextKnownPart;
    cursor = nextIndex + nextKnownPart.length;
  }

  return result;
}

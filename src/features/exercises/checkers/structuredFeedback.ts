import { normalizeNumberAnswerSignature } from '@/lib/exercise-type-conversion';
import type { EgeMultiSelectExercise, Exercise } from '../schemas';
import {
  findMaskedWordMatches,
  getDonorWordsOutsideParentheses,
  renderMaskedWordResolutionWithBold,
  resolveBestUnusedDonorForMaskedWord,
} from '../maskedWordResolver';

export type StructuredFeedbackSource =
  | 'dictation'
  | 'ege18_fill_blank'
  | 'generated_rows'
  | 'payload_feedback'
  | 'none';

export type StructuredFeedbackDiagnostics = {
  source: StructuredFeedbackSource;
  correctAnswerLines: string[];
  detailedExplanationLines: string[];
  targetIndexes: number[];
  extractedRowIndexes: number[];
  missingTargetRows: number[];
  unresolvedRows: string[];
  warnings: string[];
};

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

export function buildStructuredFeedbackDiagnostics(
  exercise: Exercise | null,
): StructuredFeedbackDiagnostics | null {
  if (!exercise) return null;

  if (exercise.type === 'dictation') {
    const feedback = extractStructuredFeedback(exercise);
    return buildDiagnosticsResult({
      source: 'dictation',
      correctAnswerLines: feedback?.correctAnswer ? [feedback.correctAnswer] : [],
      detailedExplanationLines: feedback?.detailedExplanation ? [feedback.detailedExplanation] : [],
    });
  }

  if (exercise.type === 'fill_blank' && exercise.skillTags.includes('ege.18')) {
    const feedback = extractStructuredFeedback(exercise);
    return buildDiagnosticsResult({
      source: 'ege18_fill_blank',
      correctAnswerLines: feedback?.correctAnswer.split(/\n{2,}/u).filter(Boolean) ?? [],
      detailedExplanationLines: feedback?.detailedExplanation.split(/\n+/u).filter(Boolean) ?? [],
    });
  }

  if (exercise.type !== 'ege_multi_select') return null;

  const rowsByIndex = extractRowsFromExplanation(exercise.explanation);
  const extractedRowIndexes = Object.keys(rowsByIndex).map(Number).sort((a, b) => a - b);
  const targetIndexes = [...new Set(exercise.answer.targetSet)].sort((a, b) => a - b);
  const isGeneratedRowExercise =
    exercise.skillTags.includes('ege.10') ||
    exercise.skillTags.includes('ege.9') ||
    exercise.skillTags.includes('ege.11') ||
    extractedRowIndexes.length > 0;

  if (isGeneratedRowExercise) {
    const correctAnswerLines = buildCorrectAnswerDisplayRows(exercise);
    const detailedExplanationLines = (exercise.payload.feedback?.explanation ?? [exercise.explanation])
      .map((line) => String(line ?? '').trim())
      .filter(Boolean);
    const missingTargetRows = targetIndexes.filter((index) => !rowsByIndex[index]);
    const unresolvedRows = correctAnswerLines.filter((line) => /(?:\.\.|…|_)/u.test(line));

    return buildDiagnosticsResult({
      source: 'generated_rows',
      correctAnswerLines,
      detailedExplanationLines,
      targetIndexes,
      extractedRowIndexes,
      missingTargetRows,
      unresolvedRows,
    });
  }

  if (exercise.payload.feedback) {
    return buildDiagnosticsResult({
      source: 'payload_feedback',
      correctAnswerLines: exercise.payload.feedback.correctAnswer
        .map((line) => String(line ?? '').trim())
        .filter(Boolean),
      detailedExplanationLines: exercise.payload.feedback.explanation
        .map((line) => String(line ?? '').trim())
        .filter(Boolean),
      targetIndexes,
    });
  }

  return buildDiagnosticsResult({
    source: 'none',
    correctAnswerLines: [],
    detailedExplanationLines: [],
    targetIndexes,
  });
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
  const donorWords = getDonorWordsOutsideParentheses(explanationRowText, stripMarkdown);

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
    const resolution = resolveBestUnusedDonorForMaskedWord(
      maskedMatch.value,
      donorWords,
      usedDonorIndexes,
    );

    if (!resolution) {
      console.warn('No donor word for masked word', {
        maskedWord: maskedMatch.value,
        donorWords,
        optionText,
      });
      continue;
    }

    const filledWord = renderMaskedWordResolutionWithBold(resolution);
    const start = maskedMatch.start + offset;
    const end = maskedMatch.end + offset;
    result = result.slice(0, start) + filledWord + result.slice(end);
    offset += filledWord.length - maskedMatch.value.length;
  }

  return result;
}

function buildDiagnosticsResult({
  source,
  correctAnswerLines,
  detailedExplanationLines,
  targetIndexes = [],
  extractedRowIndexes = [],
  missingTargetRows = [],
  unresolvedRows = [],
}: {
  source: StructuredFeedbackSource;
  correctAnswerLines: string[];
  detailedExplanationLines: string[];
  targetIndexes?: number[];
  extractedRowIndexes?: number[];
  missingTargetRows?: number[];
  unresolvedRows?: string[];
}): StructuredFeedbackDiagnostics {
  const warnings = [
    ...(correctAnswerLines.length === 0 ? ['no_correct_answer'] : []),
    ...(detailedExplanationLines.length === 0 ? ['no_detailed_explanation'] : []),
    ...(missingTargetRows.length > 0 ? ['missing_target_rows'] : []),
    ...(unresolvedRows.length > 0 ? ['unresolved_gaps'] : []),
  ];

  return {
    source,
    correctAnswerLines,
    detailedExplanationLines,
    targetIndexes,
    extractedRowIndexes,
    missingTargetRows,
    unresolvedRows,
    warnings,
  };
}

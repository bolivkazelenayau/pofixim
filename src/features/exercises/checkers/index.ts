import {
  exerciseSchema,
  type Exercise,
  type FillBlankExercise,
  type WordBankClozeExercise,
  type WordSearchExercise,
  type DictationExercise,
  type OrthographyRepairExercise,
  type OrderFragmentsExercise,
  type EgeMultiSelectExercise,
  type MultipleChoiceExercise,
  type Ege21PunctuationAnalysisExercise,
  type Ege20ComplexSentencePunctuationExercise,
  type PunctuationInsertExercise,
  type PunctuationConstructorExercise,
  submittedAnswerSchema,
  type SubmittedAnswer,
} from '../schemas';
import { calculateScoreDelta } from '../scoring';
import type { CheckMistake, CheckResult } from '../types';
import { normalizeNumberAnswerSignature } from '@/lib/exercise-type-conversion';

type Pedagogy = Pick<
  CheckResult,
  'mistakeCode' | 'failedStepIds' | 'stepFeedback' | 'nextRecommendation'
>;

export function checkExerciseAnswer(
  rawExercise: Exercise,
  rawSubmittedAnswer: unknown,
  options: { streak?: number; usedHint?: boolean } = {},
): CheckResult {
  const exercise = exerciseSchema.parse(rawExercise);
  const submittedAnswer = submittedAnswerSchema.parse(rawSubmittedAnswer);

  if (exercise.type !== submittedAnswer.type) {
    return buildResult({
      exercise,
      submittedAnswer,
      isCorrect: false,
      normalizedAnswer: submittedAnswer,
      mistakes: [
        {
          kind: 'answer_type_mismatch',
          message: 'Answer type does not match exercise type.',
        },
      ],
      options,
    });
  }

  switch (exercise.type) {
    case 'multiple_choice':
      if (submittedAnswer.type !== 'multiple_choice') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkMultipleChoice(exercise, submittedAnswer, options);
    case 'fill_blank':
      if (submittedAnswer.type !== 'fill_blank') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkFillBlank(exercise, submittedAnswer, options);
    case 'word_bank_cloze':
      if (submittedAnswer.type !== 'word_bank_cloze') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkWordBankCloze(exercise, submittedAnswer, options);
    case 'order_fragments':
      if (submittedAnswer.type !== 'order_fragments') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkOrderFragments(exercise, submittedAnswer, options);
    case 'word_search':
      if (submittedAnswer.type !== 'word_search') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkWordSearch(exercise, submittedAnswer, options);
    case 'dictation':
      if (submittedAnswer.type !== 'dictation') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkDictation(exercise, submittedAnswer, options);
    case 'orthography_repair':
      if (submittedAnswer.type !== 'orthography_repair') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkOrthographyRepair(exercise, submittedAnswer, options);
    case 'ege_multi_select':
      if (submittedAnswer.type !== 'ege_multi_select') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkEgeMultiSelect(exercise, submittedAnswer, options);
    case 'punctuation_insert':
      if (submittedAnswer.type !== 'punctuation_insert') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkPunctuationInsert(exercise, submittedAnswer, options);
    case 'punctuation_constructor':
      if (submittedAnswer.type !== 'punctuation_constructor') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkPunctuationConstructor(exercise, submittedAnswer, options);
    case 'ege21_punctuation_analysis':
      if (submittedAnswer.type !== 'ege21_punctuation_analysis') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkEge21PunctuationAnalysis(exercise, submittedAnswer, options);
    case 'ege20_complex_sentence_punctuation':
      if (submittedAnswer.type !== 'ege20_complex_sentence_punctuation') {
        return buildTypeMismatchResult(exercise, submittedAnswer, options);
      }
      return checkEge20ComplexSentencePunctuation(exercise, submittedAnswer, options);
  }
}

function buildTypeMismatchResult(
  exercise: Exercise,
  submittedAnswer: SubmittedAnswer,
  options: { streak?: number; usedHint?: boolean },
) {
  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect: false,
    normalizedAnswer: submittedAnswer,
    mistakes: [
      {
        kind: 'answer_type_mismatch',
        message: 'Answer type does not match exercise type.',
      },
    ],
    options,
  });
}

function checkMultipleChoice(
  exercise: MultipleChoiceExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'multiple_choice' }>,
  options: { streak?: number; usedHint?: boolean },
) {
  const isCorrect =
    submittedAnswer.selectedOptionIndex === exercise.answer.correctOptionIndex;

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: submittedAnswer,
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_option',
            message: 'Selected option is not correct.',
            target: String(submittedAnswer.selectedOptionIndex),
          },
        ],
    options,
  });
}

function checkFillBlank(
  exercise: FillBlankExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'fill_blank' }>,
  options: { streak?: number; usedHint?: boolean },
) {
  const isEge18 = exercise.skillTags.includes('ege.18');
  const normalizedValue = isEge18
    ? normalizeNumberAnswerSignature(submittedAnswer.value)
    : normalizeText(
        submittedAnswer.value,
        exercise.answer.caseSensitive,
      );
  const accepted = exercise.answer.accepted
    .map((value) =>
      isEge18
        ? normalizeNumberAnswerSignature(value)
        : normalizeText(value, exercise.answer.caseSensitive),
    )
    .filter(Boolean);
  const isCorrect = accepted.includes(normalizedValue);

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      value: normalizedValue,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_blank_value',
            message: 'Submitted value is not accepted for this blank.',
            target: submittedAnswer.value,
          },
        ],
    options,
  });
}

function checkOrderFragments(
  exercise: OrderFragmentsExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'order_fragments' }>,
  options: { streak?: number; usedHint?: boolean },
) {
  const normalized = submittedAnswer.orderedFragmentIds.map((id) => id.trim());
  const expected = exercise.answer.correctOrder;
  const isCorrect =
    normalized.length === expected.length &&
    normalized.every((id, idx) => id === expected[idx]);

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      orderedFragmentIds: normalized,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_fragment_order',
            message: 'Submitted fragment order is not correct.',
            target: expected.join(' > '),
          },
        ],
    options,
  });
}

function checkWordBankCloze(
  exercise: WordBankClozeExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'word_bank_cloze' }>,
  options: { streak?: number; usedHint?: boolean },
) {
  const normalize = (value: string) => {
    const trimmed = value.trim().replace(/\s+/g, ' ');
    return exercise.answer.caseSensitive ? trimmed : trimmed.toLowerCase();
  };

  const submittedValues = submittedAnswer.values.map(normalize);
  const expectedValues = exercise.answer.correctBySlot.map(normalize);
  const isCorrect =
    submittedValues.length === expectedValues.length &&
    submittedValues.every((value, index) => value === expectedValues[index]);

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      values: submittedValues,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_word_bank_assignment',
            message: 'Words placed into slots are not correct.',
            target: expectedValues.join(' | '),
          },
        ],
    options,
  });
}

function checkWordSearch(
  exercise: WordSearchExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'word_search' }>,
  options: { streak?: number; usedHint?: boolean },
) {
  const normalize = (value: string) => {
    const trimmed = value.trim().replace(/\s+/g, ' ');
    return exercise.answer.caseSensitive ? trimmed : trimmed.toLowerCase();
  };
  const expected = [...new Set(exercise.answer.words.map(normalize))].sort();
  const submitted = [...new Set(submittedAnswer.foundWords.map(normalize))].sort();
  const isCorrect =
    expected.length === submitted.length &&
    expected.every((word, index) => word === submitted[index]);

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      foundWords: submitted,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_word_set',
            message: 'Found words set is not correct.',
            target: expected.join(', '),
          },
        ],
    options,
  });
}

function checkDictation(
  exercise: DictationExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'dictation' }>,
  options: { streak?: number; usedHint?: boolean },
) {
  const expectedDisplayTokens = tokenizeDictationText(
    normalizeDictationText(exercise.answer.text, true),
    exercise.answer.ignorePunctuation,
  );
  const submittedDisplayTokens = tokenizeDictationText(
    normalizeDictationText(submittedAnswer.text, true),
    exercise.answer.ignorePunctuation,
  );
  const expectedTokens = expectedDisplayTokens.map((token) =>
    normalizeDictationText(token, exercise.answer.caseSensitive),
  );
  const submittedTokens = submittedDisplayTokens.map((token) =>
    normalizeDictationText(token, exercise.answer.caseSensitive),
  );
  const diff = diffTokens(
    expectedTokens,
    submittedTokens,
    expectedDisplayTokens,
    submittedDisplayTokens,
  );
  const mistakes = diff
    .filter((item) => item.kind !== 'equal')
    .map((item): CheckMistake => {
      if (item.kind === 'missing') {
        return {
          kind: 'missing_dictation_token',
          message: 'Expected token was omitted in the dictation.',
          target: item.expected,
        };
      }
      if (item.kind === 'extra') {
        return {
          kind: 'extra_dictation_token',
          message: 'Unexpected token was added in the dictation.',
          target: item.actual,
        };
      }
      return {
        kind: 'wrong_dictation_token',
        message: 'Submitted token does not match the dictated text.',
        target: `${item.expected}:${item.actual}`,
      };
    });

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect: mistakes.length === 0,
    normalizedAnswer: {
      ...submittedAnswer,
      text: normalizeDictationText(submittedAnswer.text, exercise.answer.caseSensitive),
      diff,
    },
    mistakes,
    options,
  });
}

function checkOrthographyRepair(
  exercise: OrthographyRepairExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'orthography_repair' }>,
  options: { streak?: number; usedHint?: boolean },
) {
  const normalize = (value: string) =>
    value.trim().replace(/\s+/g, ' ').toLowerCase();
  const expected = new Map(
    exercise.answer.repairs.map((repair) => [
      repair.targetId,
      normalize(repair.correct),
    ]),
  );
  const submitted = new Map(
    submittedAnswer.repairs.map((repair) => [
      repair.targetId,
      normalize(repair.value),
    ]),
  );

  const mistakes: CheckMistake[] = [];
  for (const [targetId, correct] of expected) {
    const actual = submitted.get(targetId);
    if (!actual) {
      mistakes.push({
        kind: 'missing_orthography_repair',
        message: 'Expected repair target was not fixed.',
        target: targetId,
      });
    } else if (actual !== correct) {
      mistakes.push({
        kind: 'wrong_orthography_repair',
        message: 'Repair value does not match expected spelling.',
        target: `${targetId}:${correct}`,
      });
    }
  }

  for (const targetId of submitted.keys()) {
    if (!expected.has(targetId)) {
      mistakes.push({
        kind: 'extra_orthography_repair',
        message: 'Unexpected repair target was submitted.',
        target: targetId,
      });
    }
  }

  const isCorrect = mistakes.length === 0;

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      repairs: [...submitted.entries()].map(([targetId, value]) => ({
        targetId,
        value,
      })),
      correctText: exercise.answer.correctText,
    },
    mistakes,
    options,
  });
}

function checkEgeMultiSelect(
  exercise: EgeMultiSelectExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'ege_multi_select' }>,
  options: { streak?: number; usedHint?: boolean },
) {
  const submittedSet = normalizeIndexSet(submittedAnswer.selectedOptionIndexes);
  const expectedSet = normalizeIndexSet(exercise.answer.targetSet);
  const submittedSignature = serializeIndexSet(submittedSet);
  const expectedSignature = serializeIndexSet(expectedSet);

  const acceptedSignatures = new Set(
    exercise.answer.acceptedAnswers.map((answer) =>
      serializeIndexSet(parseEge21Set(answer)),
    ),
  );

  const isCorrect =
    submittedSignature === expectedSignature ||
    acceptedSignatures.has(submittedSignature);

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      selectedOptionIndexes: submittedSet,
      signature: submittedSignature,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_option_set',
            message: 'Submitted set of options is not correct.',
            target: expectedSignature,
          },
        ],
    options,
  });
}

function checkPunctuationInsert(
  exercise: PunctuationInsertExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'punctuation_insert' }>,
  options: { streak?: number; usedHint?: boolean },
) {
  const expected = normalizeMarks(exercise.answer.marks);
  const submitted = normalizeMarks(submittedAnswer.marks);
  const isCorrect = expected === submitted;

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      marks: [...submittedAnswer.marks].sort(sortMarks),
    },
    mistakes: isCorrect
      ? []
      : buildPunctuationMistakes(exercise, submittedAnswer),
    options,
  });
}

function checkPunctuationConstructor(
  exercise: PunctuationConstructorExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'punctuation_constructor' }>,
  options: { streak?: number; usedHint?: boolean },
) {
  const expected = normalizeConstructorPlacements(exercise.answer.placements);
  const submitted = normalizeConstructorPlacements(submittedAnswer.placements);
  const isCorrect = expected === submitted;

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      rendered: renderConstructorSentence(
        exercise.payload.tokens,
        submittedAnswer.placements,
      ),
    },
    mistakes: isCorrect
      ? []
      : buildConstructorMistakes(exercise, submittedAnswer),
    options,
  });
}

function checkEge21PunctuationAnalysis(
  exercise: Ege21PunctuationAnalysisExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'ege21_punctuation_analysis' }>,
  options: { streak?: number; usedHint?: boolean },
) {
  const submittedSet = parseEge21Set(submittedAnswer.value);
  const expectedSet = normalizeIndexSet(exercise.answer.targetSet);
  const submittedSignature = serializeIndexSet(submittedSet);
  const expectedSignature = serializeIndexSet(expectedSet);

  const acceptedSignatures = new Set(
    exercise.answer.acceptedAnswers.map((answer) =>
      serializeIndexSet(parseEge21Set(answer)),
    ),
  );

  const isCorrect =
    submittedSignature === expectedSignature ||
    acceptedSignatures.has(submittedSignature);

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      parsedSet: submittedSet,
      signature: submittedSignature,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_sentence_set',
            message: 'Submitted set of sentence numbers is not correct.',
            target: expectedSignature,
          },
        ],
    options,
  });
}

function checkEge20ComplexSentencePunctuation(
  exercise: Ege20ComplexSentencePunctuationExercise,
  submittedAnswer: Extract<SubmittedAnswer, { type: 'ege20_complex_sentence_punctuation' }>,
  options: { streak?: number; usedHint?: boolean },
) {
  const submittedSet = parseEge21Set(submittedAnswer.value);
  const expectedSet = normalizeIndexSet(exercise.answer.targetSet);
  const submittedSignature = serializeIndexSet(submittedSet);
  const expectedSignature = serializeIndexSet(expectedSet);

  const acceptedSignatures = new Set(
    exercise.answer.acceptedAnswers.map((answer) =>
      serializeIndexSet(parseEge21Set(answer)),
    ),
  );

  const isCorrect =
    submittedSignature === expectedSignature ||
    acceptedSignatures.has(submittedSignature);

  return buildResult({
    exercise,
    submittedAnswer,
    isCorrect,
    normalizedAnswer: {
      ...submittedAnswer,
      parsedSet: submittedSet,
      signature: submittedSignature,
    },
    mistakes: isCorrect
      ? []
      : [
          {
            kind: 'wrong_slot_set',
            message: 'Submitted set of punctuation slots is not correct.',
            target: expectedSignature,
          },
        ],
    options,
  });
}

function buildResult({
  exercise,
  isCorrect,
  normalizedAnswer,
  mistakes,
  options,
}: {
  exercise: Exercise;
  submittedAnswer: SubmittedAnswer;
  isCorrect: boolean;
  normalizedAnswer: unknown;
  mistakes: CheckMistake[];
  options: { streak?: number; usedHint?: boolean };
}): CheckResult {
  const pedagogy = buildPedagogy(exercise, isCorrect, mistakes);
  const structuredFeedback = extractStructuredFeedback(exercise);

  return {
    isCorrect,
    scoreDelta: calculateScoreDelta({
      isCorrect,
      difficulty: exercise.difficulty,
      streak: options.streak,
      usedHint: options.usedHint,
    }),
    normalizedAnswer,
    mistakes,
    ...pedagogy,
    feedback: {
      short: isCorrect ? 'Correct' : 'Try again',
      explanation: exercise.explanation,
      correctAnswer: structuredFeedback?.correctAnswer,
      detailedExplanation: structuredFeedback?.detailedExplanation,
    },
  };
}

function extractStructuredFeedback(
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
function buildPedagogy(
  exercise: Exercise,
  isCorrect: boolean,
  mistakes: CheckMistake[],
): Pedagogy {
  const skillTags = exercise.skillTags;
  const isEge14 = skillTags.includes('ege.14');
  const isEge18 = skillTags.includes('ege.18');
  const fallbackStepId = exercise.algorithmSteps?.[0]?.id ?? 'decision';

  if (isCorrect) {
    return {
      mistakeCode: null,
      failedStepIds: [],
      stepFeedback: [],
      nextRecommendation: {
        mode: exercise.difficulty === 2 ? 'challenge' : 'transfer',
        reason: 'Верный ответ, можно переносить правило в новый контекст.',
      },
    };
  }

  if (exercise.type === 'punctuation_constructor') {
    return buildPunctuationConstructorPedagogy(exercise, mistakes);
  }

  if (exercise.type === 'orthography_repair') {
    return buildOrthographyRepairPedagogy(exercise, mistakes);
  }

  if (exercise.type === 'dictation') {
    return buildDictationPedagogy(mistakes);
  }

  if (isEge14) {
    return {
      mistakeCode: 'fipi.ege14.homonymy_or_pos_confusion',
      failedStepIds: ['pos', 'context', 'decision'],
      stepFeedback: [
        {
          stepId: 'pos',
          ok: false,
          message: 'Сначала определи часть речи у спорного слова.',
        },
        {
          stepId: 'context',
          ok: false,
          message: 'Проверь значение в контексте и зависимые слова.',
        },
        {
          stepId: 'decision',
          ok: false,
          message: 'После этого выбери слитное/раздельное/дефисное написание.',
        },
      ],
      nextRecommendation: {
        mode: 'retry',
        reason: 'Нужна повторная попытка по алгоритму ЕГЭ-14.',
      },
    };
  }

  if (isEge18) {
    return {
      mistakeCode: 'fipi.ege18.introductory_or_address_confusion',
      failedStepIds: ['syntax_role', 'boundary', 'decision'],
      stepFeedback: [
        {
          stepId: 'syntax_role',
          ok: false,
          message: 'Определи синтаксическую роль конструкции в предложении.',
        },
        {
          stepId: 'boundary',
          ok: false,
          message: 'Уточни границы вводного слова или обращения.',
        },
        {
          stepId: 'decision',
          ok: false,
          message: 'Поставь знак там, где конструкция действительно обособляется.',
        },
      ],
      nextRecommendation: {
        mode: 'retry',
        reason: 'Нужна повторная попытка с разметкой структуры предложения.',
      },
    };
  }

  return {
    mistakeCode: mistakes[0]?.kind ?? null,
    failedStepIds: [fallbackStepId],
    stepFeedback: [
      {
        stepId: fallbackStepId,
        ok: false,
        message: 'Ответ не совпал с ожидаемым правилом.',
      },
    ],
    nextRecommendation: {
      mode: 'retry',
      reason: 'Нужна повторная попытка с опорой на алгоритм.',
    },
  };
}

function buildPunctuationConstructorPedagogy(
  exercise: PunctuationConstructorExercise,
  mistakes: CheckMistake[],
): Pedagogy {
  const messagesBySlot = new Map<number, string[]>();

  for (const mistake of mistakes) {
    const target = parseConstructorMistakeTarget(mistake.target);
    if (!target) continue;

    const mark = formatConstructorMarkForFeedback(target.mark);
    const messages = messagesBySlot.get(target.slotIndex) ?? [];
    if (mistake.kind === 'missing_punctuation_constructor_mark') {
      messages.push(`В слоте ${target.slotIndex} нужен знак: ${mark}.`);
    } else if (mistake.kind === 'extra_punctuation_constructor_mark') {
      messages.push(`В слоте ${target.slotIndex} стоит лишний знак: ${mark}.`);
    } else {
      messages.push(`Проверь слот ${target.slotIndex}: место и порядок знаков.`);
    }
    messagesBySlot.set(target.slotIndex, messages);
  }

  const slotExplanations = exercise.answer.slotExplanations ?? [];
  for (const item of slotExplanations) {
    if (!messagesBySlot.has(item.slotIndex)) continue;
    const messages = messagesBySlot.get(item.slotIndex) ?? [];
    messages.push(item.text);
    messagesBySlot.set(item.slotIndex, messages);
  }

  const failedStepIds =
    messagesBySlot.size > 0
      ? [...messagesBySlot.keys()]
          .sort((left, right) => left - right)
          .map((slotIndex) => `slot_${slotIndex}`)
      : ['punctuation_constructor'];

  const stepFeedback =
    messagesBySlot.size > 0
      ? failedStepIds.map((stepId) => {
          const slotIndex = Number(stepId.replace('slot_', ''));
          const messages = messagesBySlot.get(slotIndex) ?? [
            `Проверь слот ${slotIndex}.`,
          ];
          return {
            stepId,
            ok: false,
            message: [...new Set(messages)].join(' '),
          };
        })
      : [
          {
            stepId: 'punctuation_constructor',
            ok: false,
            message: 'Проверь подсвеченные слоты: знак, место и порядок.',
          },
        ];

  return {
    mistakeCode: mistakes[0]?.kind ?? null,
    failedStepIds,
    stepFeedback,
    nextRecommendation: {
      mode: 'retry',
      reason: 'Проверь подсвеченные слоты: знак, место и порядок внутри слота.',
    },
  };
}

function parseConstructorMistakeTarget(target: string | undefined):
  | {
      slotIndex: number;
      mark: PunctuationConstructorExercise['answer']['placements'][number]['mark'];
    }
  | null {
  if (!target) return null;
  const [slotRaw, markRaw] = target.split(':');
  const slotIndex = Number(slotRaw);
  if (!Number.isInteger(slotIndex) || !markRaw) return null;
  const mark = markRaw as PunctuationConstructorExercise['answer']['placements'][number]['mark'];
  return { slotIndex, mark };
}

function formatConstructorMarkForFeedback(
  mark: PunctuationConstructorExercise['answer']['placements'][number]['mark'],
) {
  const labels: Record<
    PunctuationConstructorExercise['answer']['placements'][number]['mark'],
    string
  > = {
    comma: 'запятая',
    colon: 'двоеточие',
    semicolon: 'точка с запятой',
    dash: 'тире',
    quote_open: 'открывающая кавычка',
    quote_close: 'закрывающая кавычка',
    paren_open: 'открывающая скобка',
    paren_close: 'закрывающая скобка',
    period: 'точка',
    exclamation: 'восклицательный знак',
    question: 'вопросительный знак',
    ellipsis: 'многоточие',
  };
  return labels[mark] ?? punctuationConstructorGlyph(mark);
}

function buildOrthographyRepairPedagogy(
  exercise: OrthographyRepairExercise,
  mistakes: CheckMistake[],
): Pedagogy {
  const targetById = new Map(
    exercise.payload.targets.map((target) => [target.id, target]),
  );
  const repairById = new Map(
    exercise.answer.repairs.map((repair) => [repair.targetId, repair]),
  );
  const failedStepIds = [
    ...new Set(
      mistakes.map((mistake) => parseOrthographyRepairTargetId(mistake.target)),
    ),
  ].filter(Boolean);
  const stepIds = failedStepIds.length > 0 ? failedStepIds : ['orthography_repair'];

  return {
    mistakeCode: mistakes[0]?.kind ?? null,
    failedStepIds: stepIds,
    stepFeedback: stepIds.map((stepId) => {
      const target = targetById.get(stepId);
      const repair = repairById.get(stepId);
      const surface = target?.surface ?? 'выбранный фрагмент';
      const correct = repair?.correct ?? target?.replacement;
      const message = correct
        ? `Проверь фрагмент «${surface}»: правильный вариант — «${correct}».`
        : 'Проверь выбранный фрагмент и вариант исправления.';
      return {
        stepId,
        ok: false,
        message,
      };
    }),
    nextRecommendation: {
      mode: 'retry',
      reason: 'Найди ошибочный фрагмент и выбери нормативное написание.',
    },
  };
}

function buildDictationPedagogy(mistakes: CheckMistake[]): Pedagogy {
  const kinds = new Set(mistakes.map((mistake) => mistake.kind));
  const failedStepIds = [
    ...(kinds.has('missing_dictation_token') ? ['omissions'] : []),
    ...(kinds.has('extra_dictation_token') ? ['extras'] : []),
    ...(kinds.has('wrong_dictation_token') ? ['substitutions'] : []),
  ];

  return {
    mistakeCode: mistakes[0]?.kind ?? null,
    failedStepIds: failedStepIds.length > 0 ? failedStepIds : ['dictation'],
    stepFeedback: [
      ...(kinds.has('missing_dictation_token')
        ? [
            {
              stepId: 'omissions',
              ok: false,
              message: 'Проверь пропущенные слова и знаки: часть диктовки не попала в текст.',
            },
          ]
        : []),
      ...(kinds.has('extra_dictation_token')
        ? [
            {
              stepId: 'extras',
              ok: false,
              message: 'Убери лишние слова или знаки, которых не было в аудио.',
            },
          ]
        : []),
      ...(kinds.has('wrong_dictation_token')
        ? [
            {
              stepId: 'substitutions',
              ok: false,
              message: 'Сверь подсвеченные замены с эталонной расшифровкой.',
            },
          ]
        : []),
    ],
    nextRecommendation: {
      mode: 'retry',
      reason: 'Переслушай фрагмент и исправь подсвеченные места.',
    },
  };
}

function parseOrthographyRepairTargetId(target: string | undefined) {
  if (!target) return '';
  return target.split(':')[0] ?? '';
}

type DictationDiffItem =
  | { kind: 'equal'; expected: string; actual: string }
  | { kind: 'missing'; expected: string }
  | { kind: 'extra'; actual: string }
  | { kind: 'replace'; expected: string; actual: string };

function normalizeDictationText(value: string, caseSensitive = false) {
  const normalized = value
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[«»“”„]/g, '"')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return caseSensitive ? normalized : normalized.toLowerCase();
}

function tokenizeDictationText(value: string, ignorePunctuation = false) {
  const tokens = value.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*|[.,!?;:"()]/gu) ?? [];
  return ignorePunctuation ? tokens.filter((token) => /[\p{L}\p{N}]/u.test(token)) : tokens;
}

function diffTokens(
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

function normalizeText(value: string, caseSensitive = false) {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

function normalizeMarks(marks: PunctuationInsertExercise['answer']['marks']) {
  return [...marks]
    .sort(sortMarks)
    .map((mark) => `${mark.afterTokenIndex}:${mark.mark}`)
    .join('|');
}

function sortMarks(
  a: PunctuationInsertExercise['answer']['marks'][number],
  b: PunctuationInsertExercise['answer']['marks'][number],
) {
  return a.afterTokenIndex === b.afterTokenIndex
    ? a.mark.localeCompare(b.mark)
    : a.afterTokenIndex - b.afterTokenIndex;
}

function buildPunctuationMistakes(
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

function punctuationConstructorGlyph(
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

function normalizeConstructorPlacements(
  placements: PunctuationConstructorExercise['answer']['placements'],
) {
  return placements
    .map((placement) => `${placement.slotIndex}:${placement.mark}`)
    .join('|');
}

function renderConstructorSentence(
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

function buildConstructorMistakes(
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

function parseEge21Set(value: string): number[] {
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

function normalizeIndexSet(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function serializeIndexSet(values: number[]): string {
  return values.join(',');
}

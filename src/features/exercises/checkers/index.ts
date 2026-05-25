import {
  exerciseSchema,
  type Exercise,
  type FillBlankExercise,
  type WordBankClozeExercise,
  type WordSearchExercise,
  type OrderFragmentsExercise,
  type EgeMultiSelectExercise,
  type MultipleChoiceExercise,
  type Ege21PunctuationAnalysisExercise,
  type Ege20ComplexSentencePunctuationExercise,
  type PunctuationInsertExercise,
  submittedAnswerSchema,
  type SubmittedAnswer,
} from '../schemas';
import { calculateScoreDelta } from '../scoring';
import type { CheckMistake, CheckResult } from '../types';

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
  const normalizedValue = normalizeText(
    submittedAnswer.value,
    exercise.answer.caseSensitive,
  );
  const accepted = exercise.answer.accepted.map((value) =>
    normalizeText(value, exercise.answer.caseSensitive),
  );
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
  if (exercise.type !== 'ege_multi_select') return null;
  const isEge10 = exercise.skillTags.includes('ege.10');
  const isEge9 = exercise.skillTags.includes('ege.9');
  const feedback = exercise.payload.feedback;
  const hasStructuredRows = Object.keys(extractRowsFromExplanation(exercise.explanation)).length > 0;

  if (isEge10 || isEge9 || hasStructuredRows) {
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

  return [...new Set(exercise.answer.targetSet)]
    .sort((a, b) => a - b)
    .map((index) => {
      const fallback = optionSkeletons[index - 1];
      const fromExplanation = rowsByIndex[index];
      const optionBase = stripMarkdown(String(fallback ?? '').trim());
      if (!fromExplanation) return optionBase;

      const merged = fillGapsInOptionRowWithBold(optionBase, fromExplanation);
      return merged || optionBase;
    })
    .filter(Boolean);
}

function extractRowsFromExplanation(explanation: string): Record<number, string> {
  const result: Record<number, string> = {};

  const rowRegex =
    /(?:^|\n)\s*(?:\*\*)?Ряд\s*([1-5])(?:\*\*)?\s*:\s*([\s\S]*?)\s+[—-]\s*(?:\*\*)?(не\s+подходит|подходит)(?:\*\*)?\s*:/giu;

  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(explanation)) !== null) {
    const rowNumber = Number(match[1]);
    const rowHeader = stripMarkdown(match[2]);
    result[rowNumber] = rowHeader.trim();
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
  const optionItems = splitByTopLevelCommas(optionLine);
  const explanationItems = splitByTopLevelCommas(explanationRowText);

  if (optionItems.length !== explanationItems.length) {
    return optionLine;
  }

  return optionItems
    .map((optionItem, index) => {
      return fillGapsInOptionItem(optionItem, explanationItems[index]);
    })
    .join(', ')
    .replace(/\s+([,;:])/g, '$1')
    .replace(/,\s*/g, ', ')
    .trim();
}

function splitByTopLevelCommas(value: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of value) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);

    if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) result.push(current.trim());

  return result;
}

function fillGapsInOptionItem(optionItem: string, explanationItem: string): string {
  const option = splitHeadAndTail(optionItem);
  const donor = splitHeadAndTail(explanationItem);

  const filledHead = fillMaskedWordWithBold(option.head, donor.head);

  return `${filledHead}${option.tail}`.trim();
}

function splitHeadAndTail(item: string): { head: string; tail: string } {
  const clean = stripMarkdown(item).trim();

  const match = clean.match(/^([^\s(,;:]+)([\s\S]*)$/u);

  if (!match) return { head: clean, tail: '' };

  return {
    head: match[1],
    tail: match[2] ?? '',
  };
}

function fillMaskedWordWithBold(maskedWord: string, donorWord: string): string {
  const trailingPunctuationMatch = maskedWord.match(/[.,;:!?]+$/u);
  const trailingPunctuation = trailingPunctuationMatch ? trailingPunctuationMatch[0] : '';
  const sourceWord = trailingPunctuation
    ? maskedWord.slice(0, -trailingPunctuation.length)
    : maskedWord;

  const gapRegex = /(?:\.{2,}|…+|_+|(?<=\p{L})\.(?=\p{L}))/u;

  if (!gapRegex.test(sourceWord)) {
    return maskedWord;
  }

  const splitGapRegex = /(?:\.{2,}|…+|_+|(?<=\p{L})\.(?=\p{L}))/gu;
  const parts = sourceWord.split(splitGapRegex);

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

  return `${result}${trailingPunctuation}`;
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

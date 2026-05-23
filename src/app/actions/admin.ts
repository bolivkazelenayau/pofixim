'use server';

import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { exerciseAttempts, exercises } from '@/db/schema';
import { exerciseSchema } from '@/features/exercises/schemas';
import type { ExerciseCategory, ExerciseType } from '@/features/exercises/types';

export type ExerciseEditorInput = {
  id?: number;
  type: Extract<
    ExerciseType,
    | 'multiple_choice'
    | 'ege_multi_select'
    | 'fill_blank'
    | 'word_bank_cloze'
    | 'word_search'
    | 'order_fragments'
    | 'punctuation_insert'
    | 'ege20_complex_sentence_punctuation'
    | 'ege21_punctuation_analysis'
  >;
  seedKey?: string;
  category: ExerciseCategory;
  difficulty: 1 | 2;
  qualityStatus: 'draft' | 'review' | 'approved' | 'archived';
  prompt: string;
  explanation: string;
  skillTags: string[];
  sourceAlignment?: string;
  typicalMistake?: string;
  algorithmSteps?: string[];
  isActive?: boolean;
  options?: string[];
  correctOptionIndex?: number;
  multiCorrectOptionIndexes?: number[];
  fillBefore?: string;
  fillAfter?: string;
  fillAccepted?: string[];
  fillCaseSensitive?: boolean;
  wordBankTextWithSlots?: string;
  wordBankWords?: string[];
  wordBankCorrectBySlot?: string[];
  wordBankCaseSensitive?: boolean;
  wordSearchGridRows?: string[];
  wordSearchWords?: string[];
  wordSearchCaseSensitive?: boolean;
  orderFragments?: Array<{ id: string; text: string }>;
  orderCorrectOrder?: string[];
  punctuationTokens?: string[];
  punctuationAllowedMarks?: Array<',' | ':' | ';' | '-' | '—'>;
  punctuationMarks?: Array<{
    afterTokenIndex: number;
    mark: ',' | ':' | ';' | '-' | '—';
  }>;
  ege20TextWithSlots?: string;
  ege20Slots?: number[];
  ege20TargetSet?: number[];
  ege21TargetPunctuation?: 'comma' | 'dash' | 'colon' | 'semicolon';
  ege21Sentences?: Array<{ index: number; text: string }>;
  ege21TargetSet?: number[];
};

type ExerciseListItem = {
  id: number;
  type: string;
  skillTags: string[];
  seedKey: string | null;
  prompt: string;
  qualityStatus: string;
  updatedAt: string;
  isActive: boolean;
};

function normalizeAlgorithmSteps(steps?: string[]) {
  const normalized =
    steps
      ?.map((title) => title.trim())
      .filter((title) => title.length > 0)
      .map((title, index) => ({ id: `admin_${index + 1}`, title, required: true })) ?? [];
  return normalized.length > 0 ? normalized : undefined;
}

function isLetterChar(value: string) {
  return /^\p{L}$/u.test(value);
}

function validateFillBlankBoundaries(input: ExerciseEditorInput): string | null {
  if (input.type !== 'fill_blank') {
    return null;
  }

  const before = (input.fillBefore ?? '').trimEnd();
  const after = (input.fillAfter ?? '').trimStart();
  const lastBefore = before.slice(-1);
  const firstAfter = after.slice(0, 1);

  if (!lastBefore || !firstAfter) {
    return null;
  }

  if (isLetterChar(lastBefore) && isLetterChar(firstAfter)) {
    return 'Нельзя разрезать слово границей пропуска: заполните поля "Текст до пропуска" и "Текст после пропуска" по границе слова.';
  }

  return null;
}

function validateTypeSkillConsistency(input: ExerciseEditorInput): string | null {
  const tags = new Set((input.skillTags ?? []).map((t) => t.trim()).filter(Boolean));
  const prompt = (input.prompt ?? '').toLowerCase();
  const looksLikeEgeMultiSelect =
    prompt.includes('укажите варианты ответов') &&
    prompt.includes('запишите номера ответов');

  if (tags.has('ege.9') && looksLikeEgeMultiSelect && input.type !== 'ege_multi_select') {
    return 'Для формулировки ЕГЭ-9 с выбором номеров тип должен быть ege_multi_select, а не fill_blank.';
  }

  return null;
}

function compactCorrectAnswerLine(line: string) {
  const noNumber = line.replace(/^\s*\**\d+[).]\**\s*/u, '').trim();
  const parts = noNumber.split(/\s+[\u2014-]\s+/u);
  if (parts.length === 1) return noNumber;
  const words = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (i === 0) {
      words.push(part);
    } else {
      const match = part.match(/[,;]\s*([^,;]+)$/);
      if (match) words.push(match[1].trim());
      else {
        const match2 = part.match(/[.]\s*([^.]+)$/);
        if (match2) words.push(match2[1].trim());
        else words.push(part.trim());
      }
    }
  }
  return words
    .map((w) => w.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ');
}

function normalizeMorphemeMarkdownSpacing(value: string) {
  const joinPrefixSpaces = (part: string) => part
    .replace(/(^|[^\p{L}])не\s+с\s+(?=\p{Ll})/giu, '$1нес')
    .replace(
      /(^|[^\p{L}])(рас|раз|без|бес|нис|низ|нес|нез|вз|вс|воз|вос|из|ис|под|пред|пре|при|пра|про|транс|контр|суб|супер|сверх)\s+(?=\p{Ll}|\*\*)/giu,
      '$1$2',
    );
  const normalizeMarked = (part: string) => part
    .replace(/(?<!\p{L})рас\s+ч[её]т(?!\p{L})/giu, 'расчёт')
    .replace(/([\p{L}])\s+\*\*([\p{L}])\*\*\s*(?=[\p{L}])/gu, '$1**$2**')
    .replace(/([\p{L}])\*\*([\p{L}])\*\*\s+(?=[\p{L}])/gu, '$1**$2**')
    .replace(/(^|[^\p{L}])([\p{L}])\s+\*\*([\p{L}])\*\*\s*(?=[\p{L}])/gu, '$1$2**$3**')
    .replace(/((?=[\p{L}*]{1,24}\*\*)[\p{L}*]{1,24})\s+(?=\p{Ll})/gu, '$1')
    .replace(/\s+(?:\*\s*)+$/u, '');
  const parts = value.split(/\s+—\s+/u).map(normalizeMarked);
  if (parts.length < 2) return joinPrefixSpaces(normalizeMarked(value));
  parts[0] = parts[0].replace(
    /\b(рас|раз|без|бес|нис|низ|воз|вос|из|ис|под|пред|пре|при|сверх)\s+(?=\p{Ll})/giu,
    '$1',
  );
  return parts.map(joinPrefixSpaces).join(' — ');
}

function fillOptionBlanksFromLine(optionLine: string, explanationLine: string) {
  const optionParts = (optionLine || '').split(',').map((s) => s.trim());
  const cleanLine = normalizeMorphemeMarkdownSpacing(String(explanationLine || ''))
    .replace(/\*\*/g, '')
    .replace(/_/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '');
  const filledParts = optionParts.map((opt) => {
    const cleanOpt = normalizeMorphemeMarkdownSpacing(opt)
      .replace(/\*\*/g, '')
      .replace(/_/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, '');
    const parts = cleanOpt.split(/\.\.+/);
    if (parts.length !== 2) return opt;
    const [prefix, suffix] = parts;
    const escapedPrefix = prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const escapedSuffix = suffix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    const regex = new RegExp(escapedPrefix + '([а-яёА-ЯЁ*A-Za-z]*?)' + escapedSuffix, 'i');
    const match = cleanLine.match(regex);
    if (match) {
      return opt.replace(/\.\.+/, match[1]);
    }
    return opt;
  });
  return filledParts.join(', ');
}

function isDetailedEge10ExplanationRow(row: string) {
  return (
    /\u0420\u044f\u0434\s+(?:\u043d\u0435\s+)?\u043f\u043e\u0434\u0445\u043e\u0434\u0438\u0442/iu.test(row) ||
    /\**\u0421\u0442\u0440\u043e\u043a\u0430\s+\d+\**/iu.test(row)
  );
}

function normalizeDetailedEge10Row(row: string) {
  return row
    .replace(/^\**\u0421\u0442\u0440\u043e\u043a\u0430\s+(\d+)\**\s*/iu, '**$1)** ')
    .replace(/\s+(?:\*\s*)+$/u, '')
    .trim();
}

function splitEge10FeedbackRows(rows: string[], optionsLength: number) {
  const normalizedRows = rows
    .map(normalizeMorphemeMarkdownSpacing)
    .filter((row) => row !== '*');
  const inlineDetailedStart = normalizedRows.findIndex((row) =>
    /\**\u0421\u0442\u0440\u043e\u043a\u0430\s+\d+\**/iu.test(row),
  );
  if (inlineDetailedStart >= 0) {
    const markerized = normalizedRows[inlineDetailedStart]
      .replace(/\*\*\u0421\u0442\u0440\u043e\u043a\u0430\s+(\d+)\*\*/giu, '\n\u0421\u0442\u0440\u043e\u043a\u0430 $1')
      .replace(/([^\n])\u0421\u0442\u0440\u043e\u043a\u0430\s+(\d+)/giu, '$1\n\u0421\u0442\u0440\u043e\u043a\u0430 $2');
    const chunks = markerized
      .split('\n')
      .map((chunk) => chunk.trim())
      .filter(Boolean);
    const firstDetailedChunk = chunks.findIndex((chunk) =>
      /^\**\u0421\u0442\u0440\u043e\u043a\u0430\s+\d+\**/iu.test(chunk),
    );
    const answerRows = normalizedRows.slice(0, inlineDetailedStart);
    if (firstDetailedChunk > 0) answerRows.push(...chunks.slice(0, firstDetailedChunk));
    return {
      answerRows: answerRows.slice(0, optionsLength),
      explanationRows: chunks.slice(Math.max(firstDetailedChunk, 0)).map(normalizeDetailedEge10Row),
    };
  }
  const detailedStart = normalizedRows.findIndex(isDetailedEge10ExplanationRow);
  if (detailedStart > 0) {
    return {
      answerRows: normalizedRows.slice(0, Math.min(optionsLength, detailedStart)),
      explanationRows: normalizedRows.slice(detailedStart).map(normalizeDetailedEge10Row),
    };
  }
  return {
    answerRows: normalizedRows,
    explanationRows: normalizedRows,
  };
}

function splitFeedbackFromExplanation(explanation: string, options: string[]) {
  const markerRegex =
    /\u041f\u0440\u0438\u0432\u0435\u0434[\u0435\u0451]\u043c \u0432\u0435\u0440\u043d\u043e\u0435 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0435[:.]?\s*/u;
  const normalized = explanation.replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '');
  const markerMatch = normalized.match(markerRegex);
  const tail = markerMatch ? normalized.slice((markerMatch.index ?? 0) + markerMatch[0].length) : normalized;

  // Split by newlines first, then by inline numbered patterns
  const lines = tail.split('\n').map((l) => l.trim()).filter(Boolean);

  const numberedRows: string[] = [];
  let currentRow: string | null = null;
  for (const line of lines) {
    const inlineChunks = line.split(/(?=(?:^|\s)\**\d+[).]\**\s)/).map((c) => c.trim()).filter(Boolean);
    for (const chunk of inlineChunks) {
      const numMatch = chunk.match(/^\s*\**(\d+)[).]\**\s*/);
      if (numMatch) {
        if (currentRow !== null) numberedRows.push(currentRow);
        currentRow = chunk;
      } else if (currentRow !== null) {
        currentRow += ' ' + chunk;
      }
    }
  }
  if (currentRow !== null) numberedRows.push(currentRow);

  if (numberedRows.length > 0) {
    numberedRows[numberedRows.length - 1] = numberedRows[numberedRows.length - 1]
      .replace(/\s*\u041e\u0442\u0432\u0435\u0442:\s*[\d,.\s]+.*$/iu, '')
      .trim();
  }

  const rows = splitEge10FeedbackRows(
    numberedRows.length > 0 ? numberedRows : [tail],
    options.length,
  );
  const correctAnswer = rows.answerRows.map((line, i) => {
    if (options && options[i]) {
      return fillOptionBlanksFromLine(options[i], line);
    }
    return compactCorrectAnswerLine(line);
  }).filter(Boolean);

  if (!correctAnswer.length || !rows.explanationRows.length) return null;
  return { correctAnswer, explanation: rows.explanationRows };
}

function buildCorrectAnswerLinesFromOptions(
  options: string[],
  targetSet: number[],
  explanationLines: string[] = [],
) {
  return [...new Set(targetSet)]
    .sort((a, b) => a - b)
    .map((idx) => {
      const option = options[idx - 1]?.trim();
      if (!option) return '';
      const explanationLine = explanationLines[idx - 1];
      return explanationLine
        ? fillOptionBlanksFromLine(option, explanationLine)
        : option;
    })
    .filter((value): value is string => Boolean(value));
}

function buildExercisePayload(input: ExerciseEditorInput) {
  const base = {
    type: input.type,
    seedKey: input.seedKey?.trim() || null,
    category: input.category,
    difficulty: input.difficulty,
    skillTags: input.skillTags.filter(Boolean),
    prompt: input.prompt.trim(),
    explanation: input.explanation.trim(),
    sourceAlignment: input.sourceAlignment?.trim()
      ? { reference: input.sourceAlignment.trim() }
      : undefined,
    typicalMistake: input.typicalMistake?.trim() || undefined,
    algorithmSteps: normalizeAlgorithmSteps(input.algorithmSteps),
    qualityStatus: input.qualityStatus,
    isActive: input.isActive ?? true,
  };

  if (input.type === 'multiple_choice') {
    const normalizedOptions = (input.options ?? []).map((v) => v.trim()).filter(Boolean);
    const options = normalizedOptions.length >= 2 ? normalizedOptions : ['Вариант 1', 'Вариант 2'];
    const correctOptionIndex = Math.min(
      Math.max(input.correctOptionIndex ?? 0, 0),
      options.length - 1,
    );
    return {
      ...base,
      payload: { options },
      answer: { correctOptionIndex },
    };
  }

  if (input.type === 'ege_multi_select') {
    const normalizedOptions = (input.options ?? []).map((v) => v.trim()).filter(Boolean);
    const options =
      normalizedOptions.length >= 2 ? normalizedOptions : ['Вариант 1', 'Вариант 2'];
    const targetSet = [...new Set((input.multiCorrectOptionIndexes ?? []).map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))].sort((a, b) => a - b);
    const safeTargetSet = targetSet.filter((idx) => idx <= options.length);
    const signature = safeTargetSet.join('');
    const isEge10 = input.skillTags.some((tag) => tag.trim() === 'ege.10');
    const parsedFeedback = isEge10
      ? splitFeedbackFromExplanation(base.explanation, options)
      : null;
    const correctAnswer = buildCorrectAnswerLinesFromOptions(
      options,
      safeTargetSet,
      parsedFeedback?.explanation ?? [],
    );
    const structuredFeedback =
      isEge10 && parsedFeedback && correctAnswer.length
        ? { ...parsedFeedback, correctAnswer }
        : null;
    const explanation = isEge10
      ? parsedFeedback?.explanation.join('\n') ?? normalizeMorphemeMarkdownSpacing(base.explanation)
      : base.explanation;
    return {
      ...base,
      explanation,
      payload: {
        options,
        ...(structuredFeedback ? { feedback: structuredFeedback } : {}),
      },
      answer: {
        rawAnswerText: signature || '1',
        acceptedAnswers: signature ? [signature] : ['1'],
        targetSet: safeTargetSet.length ? safeTargetSet : [1],
      },
    };
  }

  if (input.type === 'fill_blank') {
    const accepted = (input.fillAccepted ?? []).map((v) => v.trim()).filter(Boolean);
    return {
      ...base,
      payload: {
        before: input.fillBefore ?? '',
        after: input.fillAfter ?? '',
      },
      answer: {
        accepted: accepted.length ? accepted : ['пример'],
        caseSensitive: Boolean(input.fillCaseSensitive),
      },
    };
  }

  if (input.type === 'word_bank_cloze') {
    const wordBank = (input.wordBankWords ?? []).map((v) => v.trim()).filter(Boolean);
    const correctBySlot = (input.wordBankCorrectBySlot ?? [])
      .map((v) => v.trim())
      .filter(Boolean);
    const slotCount = correctBySlot.length > 0 ? correctBySlot.length : 1;
    return {
      ...base,
      payload: {
        textWithSlots: (input.wordBankTextWithSlots ?? '').trim() || 'Текст [[1]] с пропуском.',
        slotCount,
        wordBank: wordBank.length > 0 ? wordBank : ['пример'],
      },
      answer: {
        correctBySlot: correctBySlot.length > 0 ? correctBySlot : ['пример'],
        caseSensitive: Boolean(input.wordBankCaseSensitive),
      },
    };
  }

  if (input.type === 'word_search') {
    const rows = (input.wordSearchGridRows ?? [])
      .map((v) => v.trim())
      .filter(Boolean);
    const grid =
      rows.length >= 2
        ? rows.map((line) => line.split('').filter(Boolean))
        : [
            ['?', '?', '?'],
            ['?', '?', '?'],
          ];
    const words = (input.wordSearchWords ?? []).map((v) => v.trim()).filter(Boolean);
    return {
      ...base,
      payload: {
        grid,
        words: words.length > 0 ? words : ['?'],
        allowDiagonal: true,
        allowReverse: true,
      },
      answer: {
        words: words.length > 0 ? words : ['?'],
        caseSensitive: Boolean(input.wordSearchCaseSensitive),
      },
    };
  }

  if (input.type === 'order_fragments') {
    const normalizedFragments = (input.orderFragments ?? [])
      .map((f) => ({ id: (f.id ?? '').trim(), text: (f.text ?? '').trim() }))
      .filter((f) => f.id.length > 0 && f.text.length > 0);
    const fragments =
      normalizedFragments.length >= 2
        ? normalizedFragments
        : [
            { id: 'f1', text: 'Первый фрагмент' },
            { id: 'f2', text: 'Второй фрагмент' },
          ];
    const idSet = new Set(fragments.map((f) => f.id));
    const normalizedOrder = (input.orderCorrectOrder ?? [])
      .map((id) => id.trim())
      .filter((id) => idSet.has(id));
    const correctOrder =
      normalizedOrder.length === fragments.length
        ? normalizedOrder
        : fragments.map((f) => f.id);

    return {
      ...base,
      payload: { fragments },
      answer: { correctOrder },
    };
  }

  if (input.type === 'ege20_complex_sentence_punctuation') {
    const rawSlots = [...new Set((input.ege20Slots ?? []).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
    const slots = rawSlots.length >= 2 ? rawSlots : [1, 2];
    const slotSet = new Set(slots);
    const targetSet = [...new Set((input.ege20TargetSet ?? []).filter((n) => Number.isInteger(n) && n > 0 && slotSet.has(n)))].sort((a, b) => a - b);
    const signature = targetSet.join('');
    return {
      ...base,
      payload: {
        textWithSlots: (input.ege20TextWithSlots ?? '').trim() || 'Текст (1) ... (2) ...',
        slots,
      },
      answer: {
        rawAnswerText: signature || '1',
        acceptedAnswers: signature ? [signature] : ['1'],
        targetSet: targetSet.length ? targetSet : [slots[0]],
      },
    };
  }

  if (input.type === 'ege21_punctuation_analysis') {
    const rawSentences = (input.ege21Sentences ?? [])
      .filter((s) => Number.isInteger(s.index) && s.index > 0 && s.text.trim().length > 0)
      .map((s) => ({ index: s.index, text: s.text.trim() }))
      .sort((a, b) => a.index - b.index);
    const sentences =
      rawSentences.length >= 2
        ? rawSentences
        : [
            { index: 1, text: 'Первое предложение.' },
            { index: 2, text: 'Второе предложение.' },
          ];
    const sentenceIndexSet = new Set(sentences.map((s) => s.index));
    const targetSet = [...new Set((input.ege21TargetSet ?? []).filter((n) => Number.isInteger(n) && n > 0 && sentenceIndexSet.has(n)))].sort((a, b) => a - b);
    const signature = targetSet.join('');
    return {
      ...base,
      payload: {
        targetPunctuation: input.ege21TargetPunctuation ?? 'comma',
        sentences,
      },
      answer: {
        rawAnswerText: signature || '1',
        acceptedAnswers: signature ? [signature] : ['1'],
        targetSet: targetSet.length ? targetSet : [sentences[0].index],
      },
    };
  }

  return {
    ...base,
    payload: {
      tokens:
        (input.punctuationTokens ?? []).map((v) => v.trim()).filter(Boolean).length >= 2
          ? (input.punctuationTokens ?? []).map((v) => v.trim()).filter(Boolean)
          : ['Токен 1', 'Токен 2'],
      allowedMarks:
        (input.punctuationAllowedMarks ?? []).length > 0
          ? input.punctuationAllowedMarks!
          : [','],
    },
    answer: {
      marks: input.punctuationMarks ?? [],
    },
  };
}

export async function createExerciseAction(input: ExerciseEditorInput) {
  try {
    const normalizedSeedKey = input.seedKey?.trim() ?? '';
    if (!normalizedSeedKey) {
      return {
        success: false,
        error:
          'seedKey обязателен для создания задания: это защищает от дублей в админке и импортах.',
      };
    }

    const fillBlankBoundaryError = validateFillBlankBoundaries(input);
    if (fillBlankBoundaryError) {
      return { success: false, error: fillBlankBoundaryError };
    }
    const typeSkillError = validateTypeSkillConsistency(input);
    if (typeSkillError) {
      return { success: false, error: typeSkillError };
    }

    const parsed = exerciseSchema.safeParse(
      buildExercisePayload({
        ...input,
        seedKey: normalizedSeedKey,
      }),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path?.length ? issue.path.join('.') : 'unknown';
      return {
        success: false,
        error: issue ? `${path}: ${issue.message}` : 'Validation failed',
      };
    }

    const exercise = parsed.data;
    const existingBySeedKey = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.seedKey, normalizedSeedKey))
      .limit(1);

    if (existingBySeedKey[0]) {
      return {
        success: false,
        error: `Задание с seedKey "${normalizedSeedKey}" уже существует (id=${existingBySeedKey[0].id}).`,
      };
    }

    const inserted = await db
      .insert(exercises)
      .values({
        seedKey: normalizedSeedKey,
        type: exercise.type,
        category: exercise.category,
        difficulty: exercise.difficulty,
        skillTags: exercise.skillTags,
        prompt: exercise.prompt,
        payload: exercise.payload,
        answer: exercise.answer,
        explanation: exercise.explanation,
        sourceAlignment: exercise.sourceAlignment ?? null,
        typicalMistake: exercise.typicalMistake ?? null,
        algorithmSteps: exercise.algorithmSteps ?? null,
        qualityStatus: exercise.qualityStatus,
        isActive: exercise.isActive,
      })
      .returning({ id: exercises.id });

    return { success: true, id: inserted[0]?.id };
  } catch (error) {
    console.error('Failed to create exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  }
}

export async function updateExerciseAction(input: ExerciseEditorInput & { id: number }) {
  try {
    const normalizedSeedKey = input.seedKey?.trim() ?? '';
    if (!normalizedSeedKey) {
      return {
        success: false,
        error:
          'seedKey обязателен при обновлении задания: это защищает от дублей и потери связи с импортом.',
      };
    }

    const fillBlankBoundaryError = validateFillBlankBoundaries(input);
    if (fillBlankBoundaryError) {
      return { success: false, error: fillBlankBoundaryError };
    }
    const typeSkillError = validateTypeSkillConsistency(input);
    if (typeSkillError) {
      return { success: false, error: typeSkillError };
    }

    const parsed = exerciseSchema.safeParse(
      buildExercisePayload({
        ...input,
        seedKey: normalizedSeedKey,
      }),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path?.length ? issue.path.join('.') : 'unknown';
      return {
        success: false,
        error: issue ? `${path}: ${issue.message}` : 'Validation failed',
      };
    }

    const exercise = parsed.data;
    const existingBySeedKey = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.seedKey, normalizedSeedKey), ne(exercises.id, input.id)))
      .limit(1);

    if (existingBySeedKey[0]) {
      return {
        success: false,
        error: `Нельзя сохранить: seedKey "${normalizedSeedKey}" уже занят заданием id=${existingBySeedKey[0].id}.`,
      };
    }

    const updated = await db
      .update(exercises)
      .set({
        seedKey: normalizedSeedKey,
        type: exercise.type,
        category: exercise.category,
        difficulty: exercise.difficulty,
        skillTags: exercise.skillTags,
        prompt: exercise.prompt,
        payload: exercise.payload,
        answer: exercise.answer,
        explanation: exercise.explanation,
        sourceAlignment: exercise.sourceAlignment ?? null,
        typicalMistake: exercise.typicalMistake ?? null,
        algorithmSteps: exercise.algorithmSteps ?? null,
        qualityStatus: exercise.qualityStatus,
        isActive: exercise.isActive,
        updatedAt: new Date(),
      })
      .where(eq(exercises.id, input.id))
      .returning({ id: exercises.id });

    if (updated.length === 0) {
      return { success: false, error: 'Exercise not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to update exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  }
}

export async function deleteExerciseAction(id: number) {
  try {
    if (!Number.isInteger(id) || id <= 0) {
      return { success: false, error: 'Invalid exercise id' };
    }

    const deleted = await db.transaction(async (tx) => {
      await tx.delete(exerciseAttempts).where(eq(exerciseAttempts.exerciseId, id));
      return tx.delete(exercises).where(eq(exercises.id, id)).returning({ id: exercises.id });
    });

    if (deleted.length === 0) {
      return { success: false, error: 'Exercise not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to delete exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  }
}

type ListExercisesParams = {
  limit?: number;
  offset?: number;
  query?: string;
  type?: string;
  qualityStatus?: string;
  examType?: string;
};

export async function getExerciseTypeOptionsAction() {
  try {
    const rows = await db.execute(
      sql`select unnest(enum_range(NULL::exercise_type))::text as type`,
    );
    const items = rows
      .map((row) => String((row as { type?: unknown }).type ?? '').trim())
      .filter((v) => v.length > 0);

    return { success: true, items };
  } catch (error) {
    console.error('Failed to fetch exercise type options:', error);
    return { success: false, items: [] as string[] };
  }
}

export async function listExercisesAction(params: ListExercisesParams = {}) {
  try {
    const normalizedLimit = Math.max(1, Math.min(params.limit ?? 100, 500));
    const normalizedOffset = Math.max(0, params.offset ?? 0);
    const query = (params.query ?? '').trim();
    const type = (params.type ?? 'all').trim();
    const qualityStatus = (params.qualityStatus ?? 'all').trim();
    const examType = (params.examType ?? 'all').trim();

    const whereParts = [sql`${exercises.id} is not null`];
    if (type !== 'all') whereParts.push(eq(exercises.type, type as typeof exercises.type._.data));
    if (qualityStatus !== 'all') whereParts.push(eq(exercises.qualityStatus, qualityStatus));
    if (examType !== 'all') {
      whereParts.push(
        sql`exists (
          select 1
          from unnest(${exercises.skillTags}) as tag
          where tag = ${`ege.${examType}`}
        )`,
      );
    }
    if (query) {
      const pattern = `%${query.toLowerCase()}%`;
      whereParts.push(
        sql`(
          cast(${exercises.id} as text) ilike ${pattern}
          or lower(coalesce(${exercises.seedKey}, '')) like ${pattern}
          or lower(${exercises.prompt}) like ${pattern}
        )`,
      );
    }

    const whereExpr = and(...whereParts);

    const totalRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(exercises)
      .where(whereExpr);
    const total = Number(totalRows[0]?.count ?? 0);

    const rows = await db
      .select({
        id: exercises.id,
        type: exercises.type,
        skillTags: exercises.skillTags,
        seedKey: exercises.seedKey,
        prompt: exercises.prompt,
        qualityStatus: exercises.qualityStatus,
        updatedAt: exercises.updatedAt,
        isActive: exercises.isActive,
      })
      .from(exercises)
      .where(whereExpr)
      .orderBy(desc(exercises.updatedAt))
      .limit(normalizedLimit)
      .offset(normalizedOffset);

    const items: ExerciseListItem[] = rows.map((row) => ({
      id: row.id,
      type: row.type,
      skillTags: row.skillTags,
      seedKey: row.seedKey,
      prompt: row.prompt,
      qualityStatus: row.qualityStatus,
      updatedAt: row.updatedAt.toISOString(),
      isActive: row.isActive,
    }));

    return {
      success: true,
      items,
      total,
      hasMore: normalizedOffset + items.length < total,
      nextOffset: normalizedOffset + items.length,
    };
  } catch (error) {
    console.error('Failed to list exercises:', error);
    return {
      success: false,
      error: 'Unexpected error',
      items: [] as ExerciseListItem[],
      total: 0,
      hasMore: false,
      nextOffset: 0,
    };
  }
}

export async function getExerciseByIdAction(id: number) {
  try {
    const rows = await db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
    const row = rows[0];
    if (!row) return { success: false, error: 'Exercise not found' };

    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const answer = (row.answer ?? {}) as Record<string, unknown>;
    const sourceAlignment = (row.sourceAlignment ?? {}) as Record<string, unknown>;
    const algorithmSteps = Array.isArray(row.algorithmSteps) ? row.algorithmSteps : [];

    const base = {
      id: row.id,
      type: row.type,
      seedKey: row.seedKey ?? '',
      category: row.category,
      difficulty: row.difficulty as 1 | 2,
      qualityStatus: row.qualityStatus as ExerciseEditorInput['qualityStatus'],
      prompt: row.prompt,
      explanation: row.explanation,
      skillTags: row.skillTags,
      sourceAlignment: typeof sourceAlignment.reference === 'string' ? sourceAlignment.reference : '',
      typicalMistake: row.typicalMistake ?? '',
      algorithmSteps: algorithmSteps
        .map((s) => (typeof (s as Record<string, unknown>).title === 'string' ? (s as Record<string, unknown>).title as string : ''))
        .filter(Boolean),
      isActive: row.isActive,
    };

    if (row.type === 'multiple_choice') {
      return {
        success: true,
        item: {
          ...base,
          options: Array.isArray(payload.options) ? payload.options.filter((v): v is string => typeof v === 'string') : [],
          correctOptionIndex: typeof answer.correctOptionIndex === 'number' ? answer.correctOptionIndex : 0,
        },
      };
    }

    if (row.type === 'ege_multi_select') {
      return {
        success: true,
        item: {
          ...base,
          options: Array.isArray(payload.options) ? payload.options.filter((v): v is string => typeof v === 'string') : [],
          multiCorrectOptionIndexes: Array.isArray(answer.targetSet)
            ? answer.targetSet.filter((v): v is number => typeof v === 'number')
            : [],
        },
      };
    }

    if (row.type === 'fill_blank') {
      return {
        success: true,
        item: {
          ...base,
          fillBefore: typeof payload.before === 'string' ? payload.before : '',
          fillAfter: typeof payload.after === 'string' ? payload.after : '',
          fillAccepted: Array.isArray(answer.accepted) ? answer.accepted.filter((v): v is string => typeof v === 'string') : [],
          fillCaseSensitive: Boolean(answer.caseSensitive),
        },
      };
    }

    if (row.type === 'word_bank_cloze') {
      return {
        success: true,
        item: {
          ...base,
          wordBankTextWithSlots:
            typeof payload.textWithSlots === 'string' ? payload.textWithSlots : '',
          wordBankWords: Array.isArray(payload.wordBank)
            ? payload.wordBank.filter((v): v is string => typeof v === 'string')
            : [],
          wordBankCorrectBySlot: Array.isArray(answer.correctBySlot)
            ? answer.correctBySlot.filter((v): v is string => typeof v === 'string')
            : [],
          wordBankCaseSensitive: Boolean(answer.caseSensitive),
        },
      };
    }

    if (row.type === 'word_search') {
      return {
        success: true,
        item: {
          ...base,
          wordSearchGridRows: Array.isArray(payload.grid)
            ? (payload.grid as unknown[])
                .map((row) =>
                  Array.isArray(row)
                    ? row
                        .map((cell) => (typeof cell === 'string' ? cell : ''))
                        .join('')
                    : '',
                )
                .filter(Boolean)
            : [],
          wordSearchWords: Array.isArray(answer.words)
            ? answer.words.filter((v): v is string => typeof v === 'string')
            : [],
          wordSearchCaseSensitive: Boolean(answer.caseSensitive),
        },
      };
    }

    if (row.type === 'order_fragments') {
      return {
        success: true,
        item: {
          ...base,
          orderFragments: Array.isArray(payload.fragments)
            ? payload.fragments
                .map((f) => (f ?? {}) as Record<string, unknown>)
                .filter((f) => typeof f.id === 'string' && typeof f.text === 'string')
                .map((f) => ({ id: String(f.id), text: String(f.text) }))
            : [],
          orderCorrectOrder: Array.isArray(answer.correctOrder)
            ? answer.correctOrder.filter((v): v is string => typeof v === 'string')
            : [],
        },
      };
    }

    if (row.type === 'ege20_complex_sentence_punctuation') {
      return {
        success: true,
        item: {
          ...base,
          ege20TextWithSlots:
            typeof payload.textWithSlots === 'string' ? payload.textWithSlots : '',
          ege20Slots: Array.isArray(payload.slots)
            ? payload.slots.filter((v): v is number => typeof v === 'number')
            : [],
          ege20TargetSet: Array.isArray(answer.targetSet)
            ? answer.targetSet.filter((v): v is number => typeof v === 'number')
            : [],
        },
      };
    }

    if (row.type === 'ege21_punctuation_analysis') {
      return {
        success: true,
        item: {
          ...base,
          ege21TargetPunctuation:
            typeof payload.targetPunctuation === 'string'
              ? payload.targetPunctuation
              : 'comma',
          ege21Sentences: Array.isArray(payload.sentences)
            ? payload.sentences
                .map((s) => (s ?? {}) as Record<string, unknown>)
                .filter((s) => typeof s.index === 'number' && typeof s.text === 'string')
                .map((s) => ({ index: Number(s.index), text: String(s.text) }))
            : [],
          ege21TargetSet: Array.isArray(answer.targetSet)
            ? answer.targetSet.filter((v): v is number => typeof v === 'number')
            : [],
        },
      };
    }

    return {
      success: true,
      item: {
        ...base,
        punctuationTokens: Array.isArray(payload.tokens) ? payload.tokens.filter((v): v is string => typeof v === 'string') : [],
        punctuationAllowedMarks: Array.isArray(payload.allowedMarks) ? payload.allowedMarks : [','],
        punctuationMarks: Array.isArray(answer.marks) ? answer.marks : [],
      },
    };
  } catch (error) {
    console.error('Failed to get exercise:', error);
    return { success: false, error: 'Unexpected error' };
  }
}

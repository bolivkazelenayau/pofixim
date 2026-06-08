'use server';

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { revalidatePath, updateTag } from 'next/cache';
import { db } from '@/db';
import { exerciseAttempts, exercises } from '@/db/schema';
import { exerciseSchema } from '@/features/exercises/schemas';
import type { ExerciseCategory, ExerciseType } from '@/features/exercises/types';
import { assertAdminAuthorized } from '@/lib/admin-auth';
import {
  normalizeNumberAnswerSignature,
  stripEge18PromptFromFillBefore,
} from '@/lib/exercise-type-conversion';
import { logSlowServerAction } from '@/lib/slow-action-log';

type PunctuationConstructorMark =
  | 'comma'
  | 'colon'
  | 'semicolon'
  | 'dash'
  | 'quote_open'
  | 'quote_close'
  | 'paren_open'
  | 'paren_close'
  | 'period'
  | 'exclamation'
  | 'question'
  | 'ellipsis';

export type ExerciseEditorInput = {
  id?: number;
  type: Extract<
    ExerciseType,
    | 'multiple_choice'
    | 'ege_multi_select'
    | 'fill_blank'
    | 'word_bank_cloze'
    | 'word_search'
    | 'dictation'
    | 'orthography_repair'
    | 'order_fragments'
    | 'punctuation_insert'
    | 'punctuation_constructor'
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
  dictationTitle?: string;
  dictationAudioSrc?: string;
  dictationWaveform?: number[];
  dictationPlaybackRates?: number[];
  dictationText?: string;
  dictationCaseSensitive?: boolean;
  dictationIgnorePunctuation?: boolean;
  orthographyRepairText?: string;
  orthographyRepairMode?: 'click_then_choose' | 'click_then_type';
  orthographyRepairTargets?: Array<{
    id: string;
    surface: string;
    replacement: string;
    type: 'word' | 'span';
    options?: string[];
    occurrence?: number;
  }>;
  orthographyRepairHints?: string[];
  orthographyRepairRepairs?: Array<{
    targetId: string;
    correct: string;
  }>;
  orthographyRepairCorrectText?: string;
  orderFragments?: Array<{ id: string; text: string }>;
  orderCorrectOrder?: string[];
  punctuationTokens?: string[];
  punctuationAllowedMarks?: Array<',' | ':' | ';' | '-' | '—'>;
  punctuationMarks?: Array<{
    afterTokenIndex: number;
    mark: ',' | ':' | ';' | '-' | '—';
  }>;
  punctuationConstructorTokens?: string[];
  punctuationConstructorMarkBank?: PunctuationConstructorMark[];
  punctuationConstructorHints?: string[];
  punctuationConstructorGuidedSteps?: Array<{
    id: string;
    title: string;
    slotIndex: number;
    marks?: PunctuationConstructorMark[];
  }>;
  punctuationConstructorSegments?: Array<{
    label: string;
    tokenStart: number;
    tokenEnd: number;
    kind:
      | 'author_words'
      | 'direct_speech'
      | 'main_clause'
      | 'subordinate_clause'
      | 'introductory'
      | 'enumeration'
      | 'other';
  }>;
  punctuationConstructorPlacements?: Array<{
    slotIndex: number;
    mark: PunctuationConstructorMark;
  }>;
  punctuationConstructorSlotExplanations?: Array<{
    slotIndex: number;
    marks?: PunctuationConstructorMark[];
    text: string;
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
  explanation: string;
  searchText?: string;
  qualityStatus: string;
  updatedAt: string;
  updatedAtCursor: string;
  isActive: boolean;
};

type RawNormalizationPreviewItem = {
  file: string;
  beforeIssues: {
    spacesBeforePunct: number;
    softHyphen: number;
    zeroWidth: number;
    tripleBreaks: number;
  };
  afterIssues: {
    spacesBeforePunct: number;
    softHyphen: number;
    zeroWidth: number;
    tripleBreaks: number;
  };
  changed: boolean;
  beforeSnippet: string;
  afterSnippet: string;
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

function normalizeValidationText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateFillBlankBoundaries(input: ExerciseEditorInput): string | null {
  if (input.type !== 'fill_blank') {
    return null;
  }

  const before = (input.fillBefore ?? '').trimEnd();
  const after = (input.fillAfter ?? '').trimStart();
  const prompt = normalizeValidationText(input.prompt ?? '');
  const lastBefore = before.slice(-1);
  const firstAfter = after.slice(0, 1);
  const accepted = (input.fillAccepted ?? []).map((value) => value.trim()).filter(Boolean);
  const hasLetterAcceptedAnswer = accepted.some((value) => /\p{L}/u.test(value));
  const looksLikeNumberSignature = accepted.length > 0 && accepted.every((value) => /^\d[\d,\s.]*$/u.test(value));
  const looksLikeMultiSelectPrompt =
    prompt.includes('укажите варианты ответов') &&
    prompt.includes('запишите номера ответов');

  if (!lastBefore || !firstAfter) {
    if (!after && looksLikeMultiSelectPrompt && looksLikeNumberSignature) {
      return 'Этот fill_blank выглядит как задание с выбором номеров: текст после пропуска пустой, а допустимый ответ похож на "124". Для такого задания используйте ege_multi_select.';
    }
    return null;
  }

  // Legitimate fill_blank tasks often place the blank inside a word
  // (e.g. "вид" + "__" + "мый"). We only block word-internal splits when
  // the accepted answers do not look like letter fragments, which is a
  // strong signal of a broken cross-type conversion.
  if (hasLetterAcceptedAnswer) {
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

function validateAnswerCompleteness(input: ExerciseEditorInput): string | null {
  if (input.type === 'ege_multi_select') {
    const options = (input.options ?? []).map((value) => value.trim()).filter(Boolean);
    const targetSet = (input.multiCorrectOptionIndexes ?? [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (options.length < 2) {
      return 'Для ege_multi_select нужно заполнить как минимум два варианта ответа.';
    }

    if (targetSet.length === 0) {
      return 'Для ege_multi_select нужно указать правильные номера ответа.';
    }
  }

  if (input.type === 'fill_blank') {
    const accepted = (input.fillAccepted ?? []).map((value) => value.trim()).filter(Boolean);
    if (accepted.length === 0) {
      return 'Для fill_blank нужно указать допустимые ответы.';
    }
  }

  if (input.type === 'dictation') {
    if (!(input.dictationAudioSrc ?? '').trim()) {
      return 'Для dictation нужно указать путь к аудио.';
    }
    if (!(input.dictationText ?? '').trim()) {
      return 'Для dictation нужно указать эталонную расшифровку.';
    }
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
    .replace(
      /(^|[^\p{L}])(рас|раз|без|бес|нис|низ|нес|нез|вз|вс|воз|вос|из|ис|под|пред|пре|при|пра|про|транс|контр|суб|супер|сверх)\s+(?=\p{Ll}|\*\*)/giu,
      '$1$2',
    );
  const normalizeMarked = (part: string) => part
    .replace(/(?<!\p{L})рас\s+ч[её]т(?!\p{L})/giu, 'расчёт')
    .replace(/\*\*([\p{L}])\s+\*\*(?=[\p{L}])/gu, '**$1**')
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

function escapeRegExpLiteral(value: string) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
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
    const escapedPrefix = escapeRegExpLiteral(prefix);
    const escapedSuffix = escapeRegExpLiteral(suffix);
    
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
  const mergedExplanation = explanationLines.join(' ');
  return [...new Set(targetSet)]
    .sort((a, b) => a - b)
    .map((idx) => {
      const option = options[idx - 1]?.trim();
      if (!option) return '';
      const explanationLine = explanationLines[idx - 1] ?? mergedExplanation;
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
      isEge10 && correctAnswer.length
        ? {
            correctAnswer,
            explanation: parsedFeedback?.explanation.length
              ? parsedFeedback.explanation
              : [normalizeMorphemeMarkdownSpacing(base.explanation)],
          }
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
    const isEge18 = input.skillTags.some((tag) => tag.trim() === 'ege.18');
    const fillBefore = isEge18
      ? stripEge18PromptFromFillBefore(input.fillBefore ?? '', input.prompt)
      : input.fillBefore ?? '';
    const accepted = isEge18
      ? [
          normalizeNumberAnswerSignature(
            (input.fillAccepted ?? []).map((v) => v.trim()).filter(Boolean).join(','),
          ),
        ].filter(Boolean)
      : (input.fillAccepted ?? []).map((v) => v.trim()).filter(Boolean);
    return {
      ...base,
      payload: {
        before: fillBefore,
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

  if (input.type === 'dictation') {
    const answerText = (input.dictationText ?? '').trim();
    const audioSrc = (input.dictationAudioSrc ?? '').trim();
    return {
      ...base,
      payload: {
        title: (input.dictationTitle ?? '').trim() || base.prompt,
        audioSrc: audioSrc || '/voice_memos/audio_2026-06-08_00-53-43.ogg',
        ...((input.dictationWaveform ?? []).length > 0
          ? { waveform: input.dictationWaveform }
          : {}),
        ...((input.dictationPlaybackRates ?? []).length > 0
          ? { playbackRates: input.dictationPlaybackRates }
          : {}),
      },
      answer: {
        text: answerText || 'Текст диктанта.',
        caseSensitive: Boolean(input.dictationCaseSensitive),
        ignorePunctuation: Boolean(input.dictationIgnorePunctuation),
      },
    };
  }

  if (input.type === 'orthography_repair') {
    const targets = (input.orthographyRepairTargets ?? [])
      .map((target) => ({
        id: target.id.trim(),
        surface: target.surface.trim(),
        replacement: target.replacement.trim(),
        type: target.type,
        options: target.options?.map((option) => option.trim()).filter(Boolean),
        occurrence: target.occurrence,
      }))
      .filter(
        (target) =>
          target.id.length > 0 &&
          target.surface.length > 0 &&
          target.replacement.length > 0,
      );
    const safeTargets =
      targets.length > 0
        ? targets
        : [
            {
              id: 'target_1',
              surface: 'ошыбка',
              replacement: 'ошибка',
              type: 'word' as const,
              options: ['ошыбка', 'ошибка'],
            },
          ];
    const targetIds = new Set(safeTargets.map((target) => target.id));
    const repairs = (input.orthographyRepairRepairs ?? [])
      .map((repair) => ({
        targetId: repair.targetId.trim(),
        correct: repair.correct.trim(),
      }))
      .filter(
        (repair) => repair.targetId.length > 0 && repair.correct.length > 0,
      );
    const safeRepairs =
      repairs.length > 0
        ? repairs.filter((repair) => targetIds.has(repair.targetId))
        : safeTargets.map((target) => ({
            targetId: target.id,
            correct: target.replacement,
          }));
    return {
      ...base,
      payload: {
        text:
          (input.orthographyRepairText ?? '').trim() ||
          `Найдите слово: ${safeTargets[0].surface}.`,
        mode: input.orthographyRepairMode ?? 'click_then_choose',
        targets: safeTargets,
        ...((input.orthographyRepairHints ?? []).length > 0
          ? { hints: input.orthographyRepairHints }
          : {}),
      },
      answer: {
        repairs: safeRepairs.length > 0
          ? safeRepairs
          : safeTargets.map((target) => ({
              targetId: target.id,
              correct: target.replacement,
            })),
        ...((input.orthographyRepairCorrectText ?? '').trim()
          ? { correctText: input.orthographyRepairCorrectText?.trim() }
          : {}),
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

  if (input.type === 'punctuation_constructor') {
    const tokens =
      (input.punctuationConstructorTokens ?? []).map((v) => v.trim()).filter(Boolean);
    const safeTokens =
      tokens.length >= 2 ? tokens : ['Мне', 'сказали', 'Ждите', 'придет'];
    const markBank =
      input.punctuationConstructorMarkBank && input.punctuationConstructorMarkBank.length > 0
        ? [...new Set(input.punctuationConstructorMarkBank)]
        : ([
            'period',
            'comma',
            'semicolon',
            'colon',
            'question',
            'exclamation',
            'quote_open',
            'quote_close',
            'paren_open',
            'paren_close',
            'dash',
            'ellipsis',
          ] satisfies PunctuationConstructorMark[]);
    const markSet = new Set(markBank);
    const placements = (input.punctuationConstructorPlacements ?? [])
      .filter(
        (placement) =>
          Number.isInteger(placement.slotIndex) &&
          placement.slotIndex >= 0 &&
          placement.slotIndex <= safeTokens.length &&
          markSet.has(placement.mark),
      )
      .map((placement) => ({
        slotIndex: placement.slotIndex,
        mark: placement.mark,
      }));

    return {
      ...base,
      payload: {
        tokens: safeTokens,
        markBank,
        ...((input.punctuationConstructorHints ?? []).length > 0
          ? { hints: input.punctuationConstructorHints }
          : {}),
        ...((input.punctuationConstructorGuidedSteps ?? []).length > 0
          ? { guidedSteps: input.punctuationConstructorGuidedSteps }
          : {}),
        ...((input.punctuationConstructorSegments ?? []).length > 0
          ? { segments: input.punctuationConstructorSegments }
          : {}),
      },
      answer: {
        placements,
        ...((input.punctuationConstructorSlotExplanations ?? []).length > 0
          ? { slotExplanations: input.punctuationConstructorSlotExplanations }
          : {}),
      },
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
    await assertAdminAuthorized();

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
    const answerCompletenessError = validateAnswerCompleteness(input);
    if (answerCompletenessError) {
      return { success: false, error: answerCompletenessError };
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

    updateTag('admin:list');
    revalidatePath('/');
    return { success: true, id: inserted[0]?.id };
  } catch (error) {
    console.error('Failed to create exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  }
}

export async function updateExerciseAction(input: ExerciseEditorInput & { id: number }) {
  try {
    await assertAdminAuthorized();

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
    const answerCompletenessError = validateAnswerCompleteness(input);
    if (answerCompletenessError) {
      return { success: false, error: answerCompletenessError };
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
        updatedAt: sql`now()::timestamp`,
      })
      .where(eq(exercises.id, input.id))
      .returning({ id: exercises.id });

    if (updated.length === 0) {
      return { success: false, error: 'Exercise not found' };
    }

    updateTag('admin:list');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to update exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  }
}

export async function deleteExerciseAction(id: number) {
  const startedAt = Date.now();
  try {
    await assertAdminAuthorized();

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

    const existing = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.id, id))
      .limit(1);

    if (existing.length > 0) {
      console.error('Delete verification failed: exercise still exists after delete', { id });
      return { success: false, error: 'Delete verification failed' };
    }

    updateTag('admin:list');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete exercise:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error' };
  } finally {
    logSlowServerAction('deleteExerciseAction', startedAt, { id });
  }
}

export async function batchUpdateExercisesMetaAction(input: {
  ids: number[];
  qualityStatus?: ExerciseEditorInput['qualityStatus'];
  isActive?: boolean;
}) {
  try {
    await assertAdminAuthorized();

    const ids = Array.from(new Set((input.ids ?? []).filter((id) => Number.isInteger(id) && id > 0)));
    if (ids.length === 0) return { success: false, error: 'Нет id для обновления' };
    if (typeof input.qualityStatus === 'undefined' && typeof input.isActive === 'undefined') {
      return { success: false, error: 'Нет полей для обновления' };
    }

    const patch: { qualityStatus?: ExerciseEditorInput['qualityStatus']; isActive?: boolean } = {};
    if (typeof input.qualityStatus !== 'undefined') patch.qualityStatus = input.qualityStatus;
    if (typeof input.isActive !== 'undefined') patch.isActive = input.isActive;

    await db.update(exercises).set(patch).where(inArray(exercises.id, ids));
    updateTag('admin:list');
    return { success: true, updated: ids.length };
  } catch (error) {
    console.error('Failed to batch update exercises meta:', error);
    return { success: false, error: 'Unexpected error' };
  }
}

type ListExercisesParams = {
  limit?: number;
  offset?: number;
  cursorId?: number;
  cursorUpdatedAt?: string;
  query?: string;
  type?: string;
  qualityStatus?: string;
  examType?: string;
  sortBy?: 'id' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
  includeTotal?: boolean;
};

function normalizeSearchQuery(input: string) {
  return input
    .toLowerCase()
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSearchBlobQuery(input: string) {
  return input
    .toLowerCase()
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDigitsOnlySearchQuery(input: string) {
  return /^\d+$/u.test(input);
}

function isSeedKeyLikeSearchQuery(input: string) {
  return /^[a-z0-9:_-]+$/iu.test(input) && /[a-z:_-]/iu.test(input);
}

function shouldUseNormalizedBlobSearch(input: string) {
  return /[*_~[\]()<>{}|\\]/u.test(input) || /\s{2,}/u.test(input);
}

async function fetchExerciseListRows(input: {
  whereExpr: ReturnType<typeof and>;
  sortBy: 'id' | 'updatedAt';
  sortDir: 'asc' | 'desc';
  normalizedLimit: number;
  normalizedOffset: number;
  useOffset: boolean;
}) {
  const { whereExpr, sortBy, sortDir, normalizedLimit, normalizedOffset, useOffset } = input;

  return db
    .select({
      id: exercises.id,
      type: exercises.type,
      skillTags: exercises.skillTags,
      seedKey: exercises.seedKey,
      prompt: exercises.prompt,
      explanation: exercises.explanation,
      searchText: sql<string>`(${exercises.payload}::text || ' ' || ${exercises.answer}::text)`,
      qualityStatus: exercises.qualityStatus,
      updatedAt: sql<string>`${exercises.updatedAt}::text`,
      updatedAtCursor: sql<string>`${exercises.updatedAt}::text`,
      isActive: exercises.isActive,
    })
    .from(exercises)
    .where(whereExpr)
    .orderBy(
      sortBy === 'updatedAt'
        ? (sortDir === 'desc' ? desc(exercises.updatedAt) : sql`${exercises.updatedAt} asc`)
        : (sortDir === 'desc' ? desc(exercises.id) : sql`${exercises.id} asc`),
      sortDir === 'desc' ? desc(exercises.id) : sql`${exercises.id} asc`,
    )
    .limit(normalizedLimit + 1)
    .offset(useOffset ? normalizedOffset : 0);
}

type ExerciseListRow = Awaited<ReturnType<typeof fetchExerciseListRows>>[number];

function compareExerciseListRows(
  left: ExerciseListRow,
  right: ExerciseListRow,
  sortBy: 'id' | 'updatedAt',
  sortDir: 'asc' | 'desc',
) {
  if (sortBy === 'updatedAt') {
    if (left.updatedAtCursor !== right.updatedAtCursor) {
      return sortDir === 'desc'
        ? right.updatedAtCursor.localeCompare(left.updatedAtCursor)
        : left.updatedAtCursor.localeCompare(right.updatedAtCursor);
    }
  }

  return sortDir === 'desc' ? right.id - left.id : left.id - right.id;
}

function mergeExerciseListRows(
  rows: ExerciseListRow[],
  sortBy: 'id' | 'updatedAt',
  sortDir: 'asc' | 'desc',
) {
  const deduped = new Map<number, ExerciseListRow>();
  for (const row of rows) {
    if (!deduped.has(row.id)) {
      deduped.set(row.id, row);
    }
  }

  return Array.from(deduped.values()).sort((left, right) =>
    compareExerciseListRows(left, right, sortBy, sortDir),
  );
}

function buildUpdatedAtCursorCondition(input: {
  cursorId: number;
  cursorUpdatedAt: string;
  sortDir: 'asc' | 'desc';
}) {
  const { cursorId, cursorUpdatedAt, sortDir } = input;

  if (sortDir === 'desc') {
    return sql`(${exercises.updatedAt} < ${cursorUpdatedAt}::text::timestamp or (${exercises.updatedAt} = ${cursorUpdatedAt}::text::timestamp and ${exercises.id} < ${cursorId}))`;
  }

  return sql`(${exercises.updatedAt} > ${cursorUpdatedAt}::text::timestamp or (${exercises.updatedAt} = ${cursorUpdatedAt}::text::timestamp and ${exercises.id} > ${cursorId}))`;
}

export async function getExerciseTypeOptionsAction() {
  try {
    await assertAdminAuthorized();

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
  const startedAt = Date.now();
  try {
    await assertAdminAuthorized();
    const normalizedLimit = Math.max(1, Math.min(params.limit ?? 100, 500));
    const normalizedOffset = Math.max(0, params.offset ?? 0);
    const cursorId = Number(params.cursorId ?? NaN);
    const cursorUpdatedAt = (params.cursorUpdatedAt ?? '').trim();
    const query = (params.query ?? '').trim();
    const normalizedQuery = normalizeSearchQuery(query);
    const blobQuery = normalizeSearchBlobQuery(query);
    const type = (params.type ?? 'all').trim();
    const qualityStatus = (params.qualityStatus ?? 'all').trim();
    const examType = (params.examType ?? 'all').trim();
    const sortBy = params.sortBy === 'updatedAt' ? 'updatedAt' : 'id';
    const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';
    const includeTotal = Boolean(params.includeTotal);
    const hasCursor = Number.isInteger(cursorId) && cursorId > 0;

    const baseWhereParts = [sql`${exercises.id} is not null`];
    if (type !== 'all') baseWhereParts.push(eq(exercises.type, type as typeof exercises.type._.data));
    if (qualityStatus !== 'all') baseWhereParts.push(eq(exercises.qualityStatus, qualityStatus));
    if (examType !== 'all') {
      baseWhereParts.push(
        sql`${exercises.skillTags} @> array[${`ege.${examType}`}]::text[]`,
      );
    }

    const buildListResult = (rows: Awaited<ReturnType<typeof fetchExerciseListRows>>) => {
      const hasMore = rows.length > normalizedLimit;
      const pageRows = hasMore ? rows.slice(0, normalizedLimit) : rows;
      const items: ExerciseListItem[] = pageRows.map((row) => ({
        id: row.id,
        type: row.type,
        skillTags: row.skillTags,
        seedKey: row.seedKey,
        prompt: row.prompt,
        explanation: row.explanation,
        searchText: row.searchText,
        qualityStatus: row.qualityStatus,
        updatedAt: row.updatedAt,
        updatedAtCursor: row.updatedAtCursor,
        isActive: row.isActive,
      }));
      const last = pageRows[pageRows.length - 1];
      const estimatedTotal = normalizedOffset + pageRows.length + (hasMore ? 1 : 0);

      return {
        success: true,
        items,
        total: estimatedTotal,
        hasMore,
        nextOffset: normalizedOffset + items.length,
        nextCursorId: last ? last.id : null,
        nextCursorUpdatedAt: last ? last.updatedAtCursor : null,
      };
    };

    if (query && !includeTotal && !hasCursor) {
      const pattern = `%${query.toLowerCase()}%`;
      const fastQueryIsEligible =
        isDigitsOnlySearchQuery(query) || isSeedKeyLikeSearchQuery(query);
      const useNormalizedBlobSearch = shouldUseNormalizedBlobSearch(query);

      const fastRows = fastQueryIsEligible
        ? await fetchExerciseListRows({
            whereExpr: and(
              ...baseWhereParts,
              sql`(
                cast(${exercises.id} as text) ilike ${pattern}
                or lower(coalesce(${exercises.seedKey}, '')) like ${pattern}
              )`,
            ),
            sortBy,
            sortDir,
            normalizedLimit,
            normalizedOffset,
            useOffset: true,
          })
        : [];

      if (fastRows.length > normalizedLimit) {
        return buildListResult(fastRows);
      }

      const blobRows = await fetchExerciseListRows({
        whereExpr: and(
          ...baseWhereParts,
          sql`lower(
                replace(
                  coalesce(${exercises.seedKey}, '') || ' ' || coalesce(${exercises.prompt}, '') || ' ' || coalesce(${exercises.explanation}, '') || ' ' || ${exercises.payload}::text || ' ' || ${exercises.answer}::text,
                  chr(173),
                  ''
                )
              ) like ${`%${blobQuery}%`}`,
        ),
        sortBy,
        sortDir,
        normalizedLimit,
        normalizedOffset,
        useOffset: true,
      });

      const normalizedRows = useNormalizedBlobSearch
        ? await fetchExerciseListRows({
            whereExpr: and(
              ...baseWhereParts,
              sql`lower(
                    regexp_replace(
                      regexp_replace(
                        replace(
                          coalesce(${exercises.seedKey}, '') || ' ' || coalesce(${exercises.prompt}, '') || ' ' || coalesce(${exercises.explanation}, '') || ' ' || ${exercises.payload}::text || ' ' || ${exercises.answer}::text,
                          chr(173),
                          ''
                        ),
                        '[*_~\\[\\]()<>{}|\\\\]',
                        '',
                        'g'
                      ),
                      '\\s+',
                      ' ',
                      'g'
                    )
                  ) like ${`%${normalizedQuery}%`}`,
            ),
            sortBy,
            sortDir,
            normalizedLimit,
            normalizedOffset,
            useOffset: true,
          })
        : [];

      const mergedRows = mergeExerciseListRows(
        [...fastRows, ...blobRows, ...normalizedRows],
        sortBy,
        sortDir,
      );
      return buildListResult(mergedRows);
    }

    const whereParts = [...baseWhereParts];
    if (query) {
      const pattern = `%${query.toLowerCase()}%`;
      const normalizedPattern = `%${normalizedQuery}%`;
      const blobPattern = `%${blobQuery}%`;
      if (shouldUseNormalizedBlobSearch(query)) {
        whereParts.push(
          sql`(
            cast(${exercises.id} as text) ilike ${pattern}
            or lower(coalesce(${exercises.seedKey}, '')) like ${pattern}
            or lower(
              replace(
                coalesce(${exercises.seedKey}, '') || ' ' || coalesce(${exercises.prompt}, '') || ' ' || coalesce(${exercises.explanation}, '') || ' ' || ${exercises.payload}::text || ' ' || ${exercises.answer}::text,
                chr(173),
                ''
              )
            ) like ${blobPattern}
            or lower(
              regexp_replace(
                regexp_replace(
                  replace(
                    coalesce(${exercises.seedKey}, '') || ' ' || coalesce(${exercises.prompt}, '') || ' ' || coalesce(${exercises.explanation}, '') || ' ' || ${exercises.payload}::text || ' ' || ${exercises.answer}::text,
                    chr(173),
                    ''
                  ),
                  '[*_~\\[\\]()<>{}|\\\\]',
                  '',
                  'g'
                ),
                '\\s+',
                ' ',
                'g'
              )
            ) like ${normalizedPattern}
          )`,
        );
      } else {
        whereParts.push(
          sql`(
            cast(${exercises.id} as text) ilike ${pattern}
            or lower(coalesce(${exercises.seedKey}, '')) like ${pattern}
            or lower(
              replace(
                coalesce(${exercises.seedKey}, '') || ' ' || coalesce(${exercises.prompt}, '') || ' ' || coalesce(${exercises.explanation}, '') || ' ' || ${exercises.payload}::text || ' ' || ${exercises.answer}::text,
                chr(173),
                ''
              )
            ) like ${blobPattern}
          )`,
        );
      }
    }
    if (sortBy === 'id' && hasCursor) {
      if (sortDir === 'desc') whereParts.push(lt(exercises.id, cursorId));
      else whereParts.push(sql`${exercises.id} > ${cursorId}`);
    }
    if (sortBy === 'updatedAt' && hasCursor && cursorUpdatedAt) {
      // Keep PostgreSQL's full timestamp precision; Date/ISO conversion truncates microseconds.
      whereParts.push(buildUpdatedAtCursorCondition({ cursorId, cursorUpdatedAt, sortDir }));
    }

    const whereExpr = and(...whereParts);

    const rows = await fetchExerciseListRows({
      whereExpr,
      sortBy,
      sortDir,
      normalizedLimit,
      normalizedOffset,
      useOffset: !hasCursor,
    });

    const hasMore = rows.length > normalizedLimit;
    const pageRows = hasMore ? rows.slice(0, normalizedLimit) : rows;
    let total = normalizedOffset + pageRows.length + (hasMore ? 1 : 0);
    if (includeTotal) {
      const totalRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(exercises)
        .where(whereExpr);
      total = Number(totalRows[0]?.count ?? total);
    }
    const items: ExerciseListItem[] = pageRows.map((row) => ({
      id: row.id,
      type: row.type,
      skillTags: row.skillTags,
      seedKey: row.seedKey,
      prompt: row.prompt,
      explanation: row.explanation,
      searchText: row.searchText,
      qualityStatus: row.qualityStatus,
      updatedAt: row.updatedAt,
      updatedAtCursor: row.updatedAtCursor,
      isActive: row.isActive,
    }));
    const last = pageRows[pageRows.length - 1];

    return {
      success: true,
      items,
      total,
      hasMore,
      nextOffset: normalizedOffset + items.length,
      nextCursorId: last ? last.id : null,
      nextCursorUpdatedAt: last ? last.updatedAtCursor : null,
    };
  } catch (error) {
    console.error('Failed to list exercises:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
      items: [] as ExerciseListItem[],
      total: 0,
      hasMore: false,
      nextOffset: 0,
      nextCursorId: null as number | null,
      nextCursorUpdatedAt: null as string | null,
    };
  } finally {
    logSlowServerAction('listExercisesAction', startedAt, {
      sortBy: params.sortBy === 'updatedAt' ? 'updatedAt' : 'id',
      sortDir: params.sortDir === 'asc' ? 'asc' : 'desc',
      hasQuery: Boolean((params.query ?? '').trim()),
      type: (params.type ?? 'all').trim(),
      qualityStatus: (params.qualityStatus ?? 'all').trim(),
      examType: (params.examType ?? 'all').trim(),
      limit: Math.max(1, Math.min(params.limit ?? 100, 500)),
      includeTotal: Boolean(params.includeTotal),
    });
  }
}

export async function getExerciseByIdAction(id: number) {
  try {
    await assertAdminAuthorized();

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
      const isEge18 = row.skillTags.includes('ege.18');
      const fillBefore = typeof payload.before === 'string' ? payload.before : '';
      return {
        success: true,
        item: {
          ...base,
          fillBefore: isEge18
            ? stripEge18PromptFromFillBefore(fillBefore, row.prompt)
            : fillBefore,
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

    if (row.type === 'orthography_repair') {
      return {
        success: true,
        item: {
          ...base,
          orthographyRepairText:
            typeof payload.text === 'string' ? payload.text : '',
          orthographyRepairMode:
            payload.mode === 'click_then_type' ? 'click_then_type' : 'click_then_choose',
          orthographyRepairTargets: Array.isArray(payload.targets)
            ? payload.targets
                .map((target) => (target ?? {}) as Record<string, unknown>)
                .filter(
                  (target) =>
                    typeof target.id === 'string' &&
                    typeof target.surface === 'string' &&
                    typeof target.replacement === 'string' &&
                    typeof target.type === 'string',
                )
                .map((target) => ({
                  id: String(target.id),
                  surface: String(target.surface),
                  replacement: String(target.replacement),
                  type: target.type === 'span' ? 'span' as const : 'word' as const,
                  options: Array.isArray(target.options)
                    ? target.options.filter((v): v is string => typeof v === 'string')
                    : undefined,
                  occurrence:
                    typeof target.occurrence === 'number'
                      ? Number(target.occurrence)
                      : undefined,
                }))
            : [],
          orthographyRepairHints: Array.isArray(payload.hints)
            ? payload.hints.filter((v): v is string => typeof v === 'string')
            : [],
          orthographyRepairRepairs: Array.isArray(answer.repairs)
            ? answer.repairs
                .map((repair) => (repair ?? {}) as Record<string, unknown>)
                .filter(
                  (repair) =>
                    typeof repair.targetId === 'string' &&
                    typeof repair.correct === 'string',
                )
                .map((repair) => ({
                  targetId: String(repair.targetId),
                  correct: String(repair.correct),
                }))
            : [],
          orthographyRepairCorrectText:
            typeof answer.correctText === 'string' ? answer.correctText : '',
        },
      };
    }

    if (row.type === 'dictation') {
      return {
        success: true,
        item: {
          ...base,
          dictationTitle: typeof payload.title === 'string' ? payload.title : '',
          dictationAudioSrc:
            typeof payload.audioSrc === 'string' ? payload.audioSrc : '',
          dictationWaveform: Array.isArray(payload.waveform)
            ? payload.waveform.filter((v): v is number => typeof v === 'number')
            : [],
          dictationPlaybackRates: Array.isArray(payload.playbackRates)
            ? payload.playbackRates.filter((v): v is number => typeof v === 'number')
            : [],
          dictationText: typeof answer.text === 'string' ? answer.text : '',
          dictationCaseSensitive: Boolean(answer.caseSensitive),
          dictationIgnorePunctuation: Boolean(answer.ignorePunctuation),
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

    if (row.type === 'punctuation_constructor') {
      return {
        success: true,
        item: {
          ...base,
          punctuationConstructorTokens: Array.isArray(payload.tokens)
            ? payload.tokens.filter((v): v is string => typeof v === 'string')
            : [],
          punctuationConstructorMarkBank: Array.isArray(payload.markBank)
            ? payload.markBank.filter((v): v is PunctuationConstructorMark =>
                typeof v === 'string',
              )
            : [],
          punctuationConstructorHints: Array.isArray(payload.hints)
            ? payload.hints.filter((v): v is string => typeof v === 'string')
            : [],
          punctuationConstructorGuidedSteps: Array.isArray(payload.guidedSteps)
            ? payload.guidedSteps
                .map((s) => (s ?? {}) as Record<string, unknown>)
                .filter(
                  (s) =>
                    typeof s.id === 'string' &&
                    typeof s.title === 'string' &&
                    typeof s.slotIndex === 'number',
                )
                .map((s) => ({
                  id: String(s.id),
                  title: String(s.title),
                  slotIndex: Number(s.slotIndex),
                  marks: Array.isArray(s.marks)
                    ? s.marks
                        .filter((mark): mark is string => typeof mark === 'string')
                        .map((mark) => mark as PunctuationConstructorMark)
                    : undefined,
                }))
            : [],
          punctuationConstructorSegments: Array.isArray(payload.segments)
            ? payload.segments
                .map((s) => (s ?? {}) as Record<string, unknown>)
                .filter(
                  (s) =>
                    typeof s.label === 'string' &&
                    typeof s.tokenStart === 'number' &&
                    typeof s.tokenEnd === 'number' &&
                    typeof s.kind === 'string',
                )
                .map((s) => ({
                  label: String(s.label),
                  tokenStart: Number(s.tokenStart),
                  tokenEnd: Number(s.tokenEnd),
                  kind: String(s.kind),
                }))
            : [],
          punctuationConstructorPlacements: Array.isArray(answer.placements)
            ? answer.placements
                .map((p) => (p ?? {}) as Record<string, unknown>)
                .filter(
                  (p) => typeof p.slotIndex === 'number' && typeof p.mark === 'string',
                )
                .map((p) => ({
                  slotIndex: Number(p.slotIndex),
                  mark: String(p.mark) as PunctuationConstructorMark,
                }))
            : [],
          punctuationConstructorSlotExplanations: Array.isArray(answer.slotExplanations)
            ? answer.slotExplanations
                .map((s) => (s ?? {}) as Record<string, unknown>)
                .filter(
                  (s) => typeof s.slotIndex === 'number' && typeof s.text === 'string',
                )
                .map((s) => ({
                  slotIndex: Number(s.slotIndex),
                  marks: Array.isArray(s.marks)
                    ? s.marks
                        .filter((mark): mark is string => typeof mark === 'string')
                        .map((mark) => mark as PunctuationConstructorMark)
                    : undefined,
                  text: String(s.text),
                }))
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

function stripHtmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|td|th|section|article|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeOldForPreview(value: string) {
  return value
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/([A-Za-zА-Яа-яЁё])\n([a-zа-яё])/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .trim();
}

function normalizeNewForPreview(value: string) {
  return value
    .replace(/\u00ad/g, '\ue000')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/([A-Za-zА-Яа-яЁё])\ue000\n([A-Za-zА-Яа-яЁё])/g, '$1$2')
    .replace(/([A-Za-zА-Яа-яЁё])-\n([A-Za-zА-Яа-яЁё])/g, '$1$2')
    .replace(/\ue000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .trim();
}

function countPreviewIssues(text: string) {
  return {
    spacesBeforePunct: (text.match(/\s+[.,;:!?](?=\s|$)/g) ?? []).length,
    softHyphen: (text.match(/\u00ad/g) ?? []).length,
    zeroWidth: (text.match(/[\u200b\u200c\u200d\ufeff]/g) ?? []).length,
    tripleBreaks: (text.match(/\n{3,}/g) ?? []).length,
  };
}

function firstDiffIndex(a: string, b: string) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : n;
}

function snippetAt(text: string, index: number, radius = 180) {
  const from = Math.max(0, index < 0 ? 0 : index - radius);
  const to = Math.min(text.length, index < 0 ? radius * 2 : index + radius);
  return text.slice(from, to).replace(/\n/g, ' ⏎ ');
}

async function listHtmlFiles(rootDir: string) {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        out.push(full);
      }
    }
  }
  await walk(rootDir);
  return out.sort();
}

export async function previewRawNormalizationAction(input?: {
  fileFilter?: string;
  limit?: number;
}) {
  try {
    await assertAdminAuthorized();

    const rootDir = path.resolve(process.cwd(), 'test_sources', 'raw_live');
    const filter = String(input?.fileFilter ?? '').trim().toLowerCase();
    const limit = Math.max(1, Math.min(Number(input?.limit ?? 3), 20));

    let files = await listHtmlFiles(rootDir);
    if (filter) files = files.filter((f) => f.toLowerCase().includes(filter));
    files = files.slice(0, limit);
    if (files.length === 0) {
      return { success: true, items: [] as RawNormalizationPreviewItem[] };
    }

    const items: RawNormalizationPreviewItem[] = [];
    for (const file of files) {
      const html = await readFile(file, 'utf8');
      const rawText = stripHtmlToText(html);
      const before = normalizeOldForPreview(rawText);
      const after = normalizeNewForPreview(rawText);
      const diffAt = firstDiffIndex(before, after);
      items.push({
        file: path.basename(file),
        beforeIssues: countPreviewIssues(before),
        afterIssues: countPreviewIssues(after),
        changed: diffAt >= 0,
        beforeSnippet: snippetAt(before, diffAt, 180),
        afterSnippet: snippetAt(after, diffAt, 180),
      });
    }

    return { success: true, items };
  } catch (error) {
    console.error('Failed to preview raw normalization:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unexpected error', items: [] };
  }
}

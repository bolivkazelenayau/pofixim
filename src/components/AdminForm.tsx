'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import {
  createExerciseAction,
  deleteExerciseAction,
  getExerciseByIdAction,
  getExerciseTypeOptionsAction,
  listExercisesAction,
  updateExerciseAction,
  type ExerciseEditorInput,
} from '@/app/actions/admin';
import ExerciseRenderer from '@/features/exercises/renderers/ExerciseRenderer';
import { checkExerciseAnswer } from '@/features/exercises/checkers';
import {
  exerciseSchema,
  type Exercise,
  type SubmittedAnswer,
} from '@/features/exercises/schemas';
import { EXERCISE_TYPES, type ExerciseCategory } from '@/features/exercises/types';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

const categories: ExerciseCategory[] = ['orthography', 'punctuation', 'mixed'];
const qualityStatuses = ['draft', 'review', 'approved', 'archived'] as const;

type PMark = ',' | ':' | ';' | '-' | '—';
type FeedbackSections = {
  lead: string;
  correctAnswer: string;
  explanation: string;
};

type ListItem = {
  id: number;
  type: string;
  skillTags: string[];
  seedKey: string | null;
  prompt: string;
  qualityStatus: string;
  updatedAt: string;
  isActive: boolean;
};

type AdminFormProps = {
  initialItems: ListItem[];
};

type Form = {
  id?: number;
  type: ExerciseEditorInput['type'];
  seedKey: string;
  category: ExerciseCategory;
  difficulty: 1 | 2;
  qualityStatus: (typeof qualityStatuses)[number];
  prompt: string;
  explanation: string;
  skillTags: string;
  sourceAlignment: string;
  typicalMistake: string;
  algorithmSteps: string;
  isActive: boolean;
  options: string[];
  correctOptionIndex: number;
  multiCorrectOptionIndexes: string;
  fillBefore: string;
  fillAfter: string;
  fillAccepted: string;
  fillCaseSensitive: boolean;
  wordBankTextWithSlots: string;
  wordBankWords: string;
  wordBankCorrectBySlot: string;
  wordBankCaseSensitive: boolean;
  wordSearchGridRows: string;
  wordSearchWords: string;
  wordSearchCaseSensitive: boolean;
  orderFragments: string;
  orderCorrectOrder: string;
  punctuationTokens: string;
  punctuationAllowedMarks: string;
  punctuationMarks: string;
  ege20TextWithSlots: string;
  ege20Slots: string;
  ege20TargetSet: string;
  ege21TargetPunctuation: 'comma' | 'dash' | 'colon' | 'semicolon';
  ege21Sentences: string;
  ege21TargetSet: string;
};

const EMPTY: Form = {
  type: 'multiple_choice',
  seedKey: '',
  category: 'orthography',
  difficulty: 1,
  qualityStatus: 'draft',
  prompt: '',
  explanation: '',
  skillTags: 'ege.14',
  sourceAlignment: '',
  typicalMistake: '',
  algorithmSteps: '',
  isActive: true,
  options: ['', ''],
  correctOptionIndex: 0,
  multiCorrectOptionIndexes: '',
  fillBefore: '',
  fillAfter: '',
  fillAccepted: '',
  fillCaseSensitive: false,
  wordBankTextWithSlots: '',
  wordBankWords: '',
  wordBankCorrectBySlot: '',
  wordBankCaseSensitive: false,
  wordSearchGridRows: '',
  wordSearchWords: '',
  wordSearchCaseSensitive: false,
  orderFragments: '',
  orderCorrectOrder: '',
  punctuationTokens: '',
  punctuationAllowedMarks: ',',
  punctuationMarks: '',
  ege20TextWithSlots: '',
  ege20Slots: '',
  ege20TargetSet: '',
  ege21TargetPunctuation: 'comma',
  ege21Sentences: '',
  ege21TargetSet: '',
};

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200';

function seedPrefixForType(type: Form['type']) {
  switch (type) {
    case 'ege21_punctuation_analysis':
      return 'ege21';
    case 'ege20_complex_sentence_punctuation':
      return 'ege20';
    case 'ege_multi_select':
      return 'ege-ms';
    case 'fill_blank':
      return 'fill';
    case 'word_bank_cloze':
      return 'wbc';
    case 'word_search':
      return 'ws';
    case 'punctuation_insert':
      return 'punc';
    default:
      return 'mc';
  }
}

function slugFromPrompt(prompt: string) {
  const cleaned = prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return cleaned.slice(0, 32) || 'task';
}

function randomShortId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
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
    .replace(/(^|[^\p{L}*])([\p{L}]+(?:\*\*[\p{L}]+\*\*)+)\s+(?=\p{Ll})/gu, '$1$2')
    .replace(/\s+(?:\*\s*)+$/u, '');
  const parts = value.split(/\s+—\s+/u).map(normalizeMarked);
  if (parts.length < 2) return joinPrefixSpaces(normalizeMarked(value));
  parts[0] = joinPrefixSpaces(parts[0]);
  return parts.join(' — ');
}

function normalizeAnswerWord(value: string) {
  return normalizeMorphemeMarkdownSpacing(value)
    .replace(/\*\*/g, '')
    .replace(/_/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '');
}

function escapeRegExpLiteral(value: string) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function fillOptionBlanks(optionLine: string, correctLine: string) {
  const optionParts = optionLine.split(',').map(s => s.trim());
  const correctWords = correctLine.split(',').map(s => s.trim());
  if (optionParts.length !== correctWords.length) return correctLine;

  const filledParts = optionParts.map((opt, i) => {
    const word = normalizeAnswerWord(correctWords[i]);
    const cleanOpt = normalizeAnswerWord(opt);
    const parts = cleanOpt.split(/\.\.+/);
    if (parts.length !== 2) return normalizeAnswerWord(correctWords[i]); 
    const [prefix, suffix] = parts;
    const escapedPrefix = escapeRegExpLiteral(prefix);
    const escapedSuffix = escapeRegExpLiteral(suffix);
    const match = word.match(new RegExp('^' + escapedPrefix + '(.*?)' + escapedSuffix + '$', 'i'));
    if (match) {
      return opt.replace(/\.\.+/, match[1]); 
    }
    return normalizeAnswerWord(correctWords[i]); 
  });
  return filledParts.join(', ');
}

function fillOptionBlanksFromLine(optionLine: string, explanationLine: string) {
  const optionParts = optionLine.split(',').map((s) => s.trim());
  const cleanLine = normalizeAnswerWord(explanationLine);
  const filledParts = optionParts.map((opt) => {
    const cleanOpt = normalizeAnswerWord(opt);
    const parts = cleanOpt.split(/\.\.+/);
    if (parts.length !== 2) return opt;
    const [prefix, suffix] = parts;
    const escapedPrefix = escapeRegExpLiteral(prefix);
    const escapedSuffix = escapeRegExpLiteral(suffix);
    const match = cleanLine.match(new RegExp(escapedPrefix + '([\\p{L}]*?)' + escapedSuffix, 'iu'));
    return match ? opt.replace(/\.\.+/, match[1]) : opt;
  });
  return filledParts.join(', ');
}

function splitFeedbackSections(content: string, options?: string[]): FeedbackSections | null {
  if (!/\u041f\u0440\u0438\u0432\u0435\u0434[\u0435\u0451]\u043c \u0432\u0435\u0440\u043d\u043e\u0435 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0435/u.test(content)) return null;
  const normalized = content.replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '');
  const markerMatch = normalized.match(/\u041f\u0440\u0438\u0432\u0435\u0434[\u0435\u0451]\u043c \u0432\u0435\u0440\u043d\u043e\u0435 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0435[:.]?\s*/u);
  if (!markerMatch || markerMatch.index == null) return null;

  const markerIndex = markerMatch.index;
  const lead = normalized.slice(0, markerIndex).trim();
  const body = normalized.slice(markerIndex).trim();
  const tail = body.replace(/^\u041f\u0440\u0438\u0432\u0435\u0434[\u0435\u0451]\u043c \u0432\u0435\u0440\u043d\u043e\u0435 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0435[:.]?\s*/u, '').trim();

  const numberedChunks = [...tail.matchAll(/(?:^|[\n;]\s*)(\d+[).]\s*[\s\S]*?)(?=(?:[\n;]\s*\d+[).])|$)/gu)]
    .map((m) => m[1]?.trim())
    .filter((v): v is string => Boolean(v));

  const answerSource = numberedChunks.length >= 2 ? numberedChunks : tail.split('\n');
  const answerLinesRaw = answerSource
    .map((line) => line.trim())
    .filter(Boolean)
    .map(compactCorrectAnswerLine)
    .filter(Boolean);
    
  const answerLines = answerLinesRaw.map((line, idx) => {
    if (options && options[idx]) {
      return fillOptionBlanks(options[idx], line);
    }
    return line;
  });
  
  const markdownAnswerList = answerLines.join('\n\n');

  return {
    lead,
    correctAnswer: answerLines.length > 0 ? markdownAnswerList : tail,
    explanation: content,
  };
}

function extractNumberedExplanationRows(content: string) {
  const normalized = content.replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '');
  const markerRegex = /\u041f\u0440\u0438\u0432\u0435\u0434[\u0435\u0451]\u043c \u0432\u0435\u0440\u043d\u043e\u0435 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0435[:.]?\s*/u;
  const markerMatch = normalized.match(markerRegex);
  const tail = markerMatch
    ? normalized.slice((markerMatch.index ?? 0) + markerMatch[0].length)
    : normalized;

  const rows: string[] = [];
  let currentRow: string | null = null;
  const lines = tail.split('\n').map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const chunks = line
      .split(/(?=(?:^|[\s;])\**\d+[).]\**\s*)/u)
      .map((chunk) => chunk.replace(/^;\s*/, '').trim())
      .filter(Boolean);

    for (const chunk of chunks) {
      if (/^\**\d+[).]\**\s*/u.test(chunk)) {
        if (currentRow) rows.push(currentRow);
        currentRow = chunk;
      } else if (currentRow) {
        currentRow += ` ${chunk}`;
      }
    }
  }

  if (currentRow) rows.push(currentRow);

  return rows
    .map((row) => row.replace(/\s*Ответ:\s*[\d,.\s|]+.*$/iu, '').trim())
    .filter(Boolean);
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

function buildCorrectAnswerLinesFromOptions(
  options: string[],
  targetSet: number[],
  explanationRows: string[] = [],
) {
  const mergedExplanation = explanationRows.join(' ');
  return [...new Set(targetSet)]
    .sort((a, b) => a - b)
    .map((idx) => {
      const option = options[idx - 1]?.trim();
      if (!option) return '';
      const explanationRow = explanationRows[idx - 1] ?? mergedExplanation;
      return explanationRow
        ? fillOptionBlanksFromLine(option, explanationRow)
        : option;
    })
    .filter((value): value is string => Boolean(value));
}

function buildEgeMultiSelectFeedback(
  options: string[],
  targetSet: number[],
  explanation: string,
) {
  const rows = splitEge10FeedbackRows(
    extractNumberedExplanationRows(explanation),
    options.length,
  );
  const correctAnswer = buildCorrectAnswerLinesFromOptions(
    options,
    targetSet,
    rows.answerRows,
  );
  if (!correctAnswer.length) return null;
  return {
    correctAnswer,
    explanation: rows.explanationRows.length
      ? rows.explanationRows
      : [normalizeMorphemeMarkdownSpacing(explanation)],
  };
}

function shouldNormalizeEge10Form(form: Pick<Form, 'type' | 'skillTags'>) {
  return (
    form.type === 'ege_multi_select' &&
    form.skillTags
      .split(',')
      .map((tag) => tag.trim())
      .includes('ege.10')
  );
}

function normalizeFormForEditor(form: Form): Form {
  if (!shouldNormalizeEge10Form(form)) return form;
  const explanationRows = extractNumberedExplanationRows(form.explanation).map(
    normalizeMorphemeMarkdownSpacing,
  );
  const rows = splitEge10FeedbackRows(explanationRows, form.options.length);
  return {
    ...form,
    explanation: rows.explanationRows.length
      ? rows.explanationRows.join('\n')
      : normalizeMorphemeMarkdownSpacing(form.explanation),
  };
}

function escapeMarkdownParenListMarkers(value: string) {
  return value.replace(/(^|\n)(\s*)(\d+)\)/gu, '$1$2$3\\)');
}

function getDraftKey(id?: number | string | null) {
  return id ? `admin_form_draft_${id}` : 'admin_form_draft_new';
}

function loadFormState(targetId: number | null, baseForm: Form) {
  const key = getDraftKey(targetId);
  const draft = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  if (draft) {
    try {
      const parsed = JSON.parse(draft);
      if (parsed && typeof parsed === 'object') {
        return normalizeFormForEditor(parsed as Form);
      }
    } catch (e) {
      console.error(`Failed to parse ${key}`, e);
    }
  }
  return normalizeFormForEditor(baseForm);
}

export default function AdminForm({ initialItems }: AdminFormProps) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [typeOptions, setTypeOptions] = useState<Form['type'][]>(
    Array.from(EXERCISE_TYPES) as Form['type'][],
  );
  const [items, setItems] = useState<ListItem[]>(initialItems);
  const [nextOffset, setNextOffset] = useState<number>(initialItems.length);
  const [hasMore, setHasMore] = useState<boolean>(initialItems.length >= 150);
  const [totalItems, setTotalItems] = useState<number>(initialItems.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isSeedRegenerateArmed, setIsSeedRegenerateArmed] = useState(false);
  const [showSeedRegenerateModal, setShowSeedRegenerateModal] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [listTypeFilter, setListTypeFilter] = useState<string>('all');
  const [listStatusFilter, setListStatusFilter] = useState<string>('all');
  const [listExamTypeFilter, setListExamTypeFilter] = useState<string>('all');
  const [previewCheckResult, setPreviewCheckResult] = useState<{
    isCorrect: boolean;
    text: string;
    correctAnswer?: string;
    detailedExplanation?: string;
  } | null>(null);

  useEffect(() => {
    setForm(loadFormState(null, EMPTY));
    setIsDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!isDraftLoaded) return;
    const timer = setTimeout(() => {
      localStorage.setItem(getDraftKey(form.id), JSON.stringify(form));
    }, 1000);
    return () => clearTimeout(timer);
  }, [form, isDraftLoaded]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewCheckResult(null);
  }, [form]);

  const isEdit = typeof form.id === 'number';
  const parsedSkillTags = useMemo(
    () => form.skillTags.split(',').map((v) => v.trim()).filter(Boolean),
    [form.skillTags],
  );
  const parsedSteps = useMemo(
    () => form.algorithmSteps.split('\n').map((v) => v.trim()).filter(Boolean),
    [form.algorithmSteps],
  );
  const listTypes = useMemo(() => ['all', ...EXERCISE_TYPES], []);
  const listExamTypes = useMemo(
    () => ['all', ...Array.from({ length: 13 }, (_, i) => String(i + 9))],
    [],
  );

  function examTypeOf(item: ListItem) {
    for (const tag of item.skillTags ?? []) {
      const m = tag.match(/^ege\.(\d{1,2})$/);
      if (m) return m[1];
    }
    return 'n/a';
  }

  const filteredItems = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (listTypeFilter !== 'all' && item.type !== listTypeFilter) return false;
      if (listStatusFilter !== 'all' && item.qualityStatus !== listStatusFilter) return false;
      if (listExamTypeFilter !== 'all' && examTypeOf(item) !== listExamTypeFilter) return false;
      if (!q) return true;
      return (
        String(item.id).includes(q) ||
        (item.seedKey ?? '').toLowerCase().includes(q) ||
        item.prompt.toLowerCase().includes(q)
      );
    });
  }, [items, listQuery, listTypeFilter, listStatusFilter, listExamTypeFilter]);
  const groupedItems = useMemo(() => {
    const groups = new Map<string, ListItem[]>();
    for (const item of filteredItems) {
      const key = `ЕГЭ ${examTypeOf(item)} · ${item.type}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  const preview = useMemo(() => {
    const base = {
      id: form.id,
      seedKey: form.seedKey || null,
      category: form.category,
      difficulty: form.difficulty,
      prompt: form.prompt || 'Предпросмотр задания',
      explanation: form.explanation || 'Пояснение пока не заполнено.',
      skillTags: parsedSkillTags,
      sourceAlignment: form.sourceAlignment
        ? { reference: form.sourceAlignment }
        : undefined,
      typicalMistake: form.typicalMistake || undefined,
      algorithmSteps: parsedSteps.length
        ? parsedSteps.map((title, index) => ({
            id: `preview_${index + 1}`,
            title,
            required: true,
          }))
        : undefined,
      qualityStatus: form.qualityStatus,
      isActive: true,
      type: form.type,
    } as const;

    let candidate: unknown;
    if (form.type === 'multiple_choice') {
      const previewOptions = form.options.map((v) => v.trim()).filter(Boolean);
      const safeOptions = previewOptions.length > 0 ? previewOptions : ['Вариант 1'];
      const safeCorrectIndex = Math.min(
        Math.max(form.correctOptionIndex, 0),
        safeOptions.length - 1,
      );

      candidate = {
        ...base,
        payload: { options: safeOptions },
        answer: { correctOptionIndex: safeCorrectIndex },
      };
    } else if (form.type === 'ege_multi_select') {
      const previewOptions = form.options.map((v) => v.trim()).filter(Boolean);
      const safeOptions = previewOptions.length > 0 ? previewOptions : ['Вариант 1', 'Вариант 2'];
      const targetSet = form.multiCorrectOptionIndexes
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isInteger(v) && v > 0 && v <= safeOptions.length);
      const signature = [...new Set(targetSet)].sort((a, b) => a - b).join('');
      const safeTargetSet = targetSet.length ? targetSet : [1];
      const isEge10 = parsedSkillTags.includes('ege.10');
      const feedback = isEge10
        ? buildEgeMultiSelectFeedback(
            safeOptions,
            safeTargetSet,
            base.explanation,
          )
        : null;
      candidate = {
        ...base,
        explanation: isEge10
          ? normalizeMorphemeMarkdownSpacing(base.explanation)
          : base.explanation,
        payload: {
          options: safeOptions,
          ...(feedback ? { feedback } : {}),
        },
        answer: {
          rawAnswerText: signature || '1',
          acceptedAnswers: [signature || '1'],
          targetSet: safeTargetSet,
        },
      };
    } else if (form.type === 'fill_blank') {
      const accepted = form.fillAccepted
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

      candidate = {
        ...base,
        payload: {
          before: form.fillBefore || 'Текст до пропуска',
          after: form.fillAfter || 'текст после пропуска',
        },
        answer: {
          accepted: accepted.length > 0 ? accepted : ['пример'],
          caseSensitive: form.fillCaseSensitive,
        },
      };
    } else if (form.type === 'word_bank_cloze') {
      const wordBank = form.wordBankWords
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);
      const correctBySlot = form.wordBankCorrectBySlot
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);
      const slotCount = correctBySlot.length > 0 ? correctBySlot.length : 1;

      candidate = {
        ...base,
        payload: {
          textWithSlots: form.wordBankTextWithSlots || 'Текст [[1]] с пропуском.',
          slotCount,
          wordBank: wordBank.length > 0 ? wordBank : ['пример'],
        },
        answer: {
          correctBySlot: correctBySlot.length > 0 ? correctBySlot : ['пример'],
          caseSensitive: form.wordBankCaseSensitive,
        },
      };
    } else if (form.type === 'word_search') {
      const rows = form.wordSearchGridRows
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);
      const words = form.wordSearchWords
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);

      candidate = {
        ...base,
        payload: {
          grid:
            rows.length >= 2
              ? rows.map((line) => line.split('').filter(Boolean))
              : [
                  ['Д', 'О', 'М'],
                  ['О', 'К', 'Н'],
                ],
          words: words.length > 0 ? words : ['ДОМ'],
          allowDiagonal: true,
          allowReverse: true,
        },
        answer: {
          words: words.length > 0 ? words : ['ДОМ'],
          caseSensitive: form.wordSearchCaseSensitive,
        },
      };
    } else if (form.type === 'order_fragments') {
      const fragments = form.orderFragments
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, idx) => {
          const m = line.match(/^([^|]+)\|(.+)$/);
          if (m) {
            return { id: m[1].trim(), text: m[2].trim() };
          }
          return { id: `f${idx + 1}`, text: line };
        })
        .filter((f) => f.id.length > 0 && f.text.length > 0);
      const safeFragments =
        fragments.length >= 2
          ? fragments
          : [
              { id: 'f1', text: 'Первый фрагмент' },
              { id: 'f2', text: 'Второй фрагмент' },
            ];
      const idSet = new Set(safeFragments.map((f) => f.id));
      const order = form.orderCorrectOrder
        .split(',')
        .map((v) => v.trim())
        .filter((id) => idSet.has(id));
      const correctOrder =
        order.length === safeFragments.length
          ? order
          : safeFragments.map((f) => f.id);

      candidate = {
        ...base,
        payload: { fragments: safeFragments },
        answer: { correctOrder },
      };
    } else if (form.type === 'ege20_complex_sentence_punctuation') {
      const slots = form.ege20Slots
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isInteger(v) && v > 0);
      const slotsSet = new Set(slots);
      const targetSetRaw = parseIndexCsv(form.ege20TargetSet);
      const targetSet = [...new Set(targetSetRaw.filter((v) => slotsSet.has(v)))].sort(
        (a, b) => a - b,
      );
      const signature = targetSet.join('');

      candidate = {
        ...base,
        payload: {
          textWithSlots: form.ege20TextWithSlots || 'Текст (1) с (2) разметкой.',
          slots: slots.length > 0 ? [...new Set(slots)].sort((a, b) => a - b) : [1, 2],
        },
        answer: {
          rawAnswerText: signature || '1',
          acceptedAnswers: [signature || '1'],
          targetSet:
            targetSet.length > 0
              ? targetSet
              : slots.length > 0
                ? [slots[0]]
                : [1],
        },
      };
    } else if (form.type === 'ege21_punctuation_analysis') {
      const sentences = parseEge21SentencesText(form.ege21Sentences);
      const sentenceSet = new Set(sentences.map((s) => s.index));
      const targetSetRaw = parseIndexCsv(form.ege21TargetSet);
      const targetSet = [...new Set(targetSetRaw.filter((v) => sentenceSet.has(v)))].sort(
        (a, b) => a - b,
      );
      const signature = targetSet.join('');

      candidate = {
        ...base,
        payload: {
          targetPunctuation: form.ege21TargetPunctuation,
          sentences:
            sentences.length > 0
              ? sentences
              : [
                  { index: 1, text: 'Пример первого предложения.' },
                  { index: 2, text: 'Пример второго предложения.' },
                ],
        },
        answer: {
          rawAnswerText: signature || '1',
          acceptedAnswers: [signature || '1'],
          targetSet:
            targetSet.length > 0
              ? targetSet
              : sentences.length > 0
                ? [sentences[0].index]
                : [1],
        },
      };
    } else {
      const tokens = form.punctuationTokens
        .split('|')
        .map((v) => v.trim())
        .filter(Boolean);
      const allowedMarks = form.punctuationAllowedMarks
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

      candidate = {
        ...base,
        payload: {
          tokens: tokens.length > 0 ? tokens : ['Пример', 'предложения'],
          allowedMarks: allowedMarks.length > 0 ? allowedMarks : [','],
        },
        answer: {
          marks: parsePunctuationMarks(form.punctuationMarks),
        },
      };
    }

    const parsed = exerciseSchema.safeParse(candidate);
    return parsed.success
      ? { exercise: parsed.data as Exercise, error: '' }
      : {
          exercise: null,
          error: parsed.error.issues[0]?.message ?? 'Ошибка валидации превью',
        };
  }, [form, parsedSkillTags, parsedSteps]);
  const previewFeedbackSections = useMemo(() => {
    if (!previewCheckResult) return null;
    if (form.type === 'ege_multi_select' && parsedSkillTags.includes('ege.10')) {
      const previewOptions = form.options.map((v) => v.trim()).filter(Boolean);
      const targetSet = parseIndexCsv(form.multiCorrectOptionIndexes).filter(
        (idx) => idx <= previewOptions.length,
      );
      const feedback = buildEgeMultiSelectFeedback(
        previewOptions,
        targetSet,
        form.explanation,
      );
      if (feedback) {
        return {
          lead: '',
          correctAnswer: feedback.correctAnswer.join('\n\n'),
          explanation: feedback.explanation.join('\n'),
        };
      }
    }
    if (previewCheckResult.correctAnswer && previewCheckResult.detailedExplanation) {
      return {
        lead: '',
        correctAnswer: previewCheckResult.correctAnswer,
        explanation: previewCheckResult.detailedExplanation,
      };
    }
    const previewOptions = form.options.map((v) => v.trim()).filter(Boolean);
    return splitFeedbackSections(previewCheckResult.text, previewOptions);
  }, [
    previewCheckResult,
    form.options,
    form.type,
    form.multiCorrectOptionIndexes,
    form.explanation,
    parsedSkillTags,
  ]);

  function answerFeedbackPrefix(isCorrect: boolean) {
    return isCorrect ? 'Верно. ' : 'Почти, но есть ловушка. ';
  }

  function buildStepFeedbackText(
    result: ReturnType<typeof checkExerciseAnswer>,
    exerciseType?: Exercise['type'],
  ) {
    if (exerciseType === 'ege_multi_select') {
      return '';
    }
    if (!result || result.stepFeedback.length === 0) {
      return '';
    }
    const lines = result.stepFeedback.map((step, index) => `${index + 1}. ${step.message}`);
    return `\n\nРазбор по шагам:\n${lines.join('\n')}\n\nДальше: ${result.nextRecommendation.reason}`;
  }

  function handlePreviewSubmit(answer: SubmittedAnswer) {
    if (!preview.exercise) return;
    const result = checkExerciseAnswer(preview.exercise, answer, { streak: 0 });
    const previewFeedback =
      preview.exercise.type === 'ege_multi_select'
        ? preview.exercise.payload.feedback
        : undefined;
    setPreviewCheckResult({
      isCorrect: result.isCorrect,
      text: `${answerFeedbackPrefix(result.isCorrect)}\n\n${result.feedback.explanation}${buildStepFeedbackText(
        result,
        preview.exercise.type,
      )}`,
      correctAnswer:
        previewFeedback?.correctAnswer.join('\n\n') ?? result.feedback.correctAnswer,
      detailedExplanation:
        previewFeedback?.explanation.join('\n') ?? result.feedback.detailedExplanation,
    });
  }

  function generateSeedKey() {
    const prefix = seedPrefixForType(form.type);
    const slug = slugFromPrompt(form.prompt);
    const suffix = randomShortId();
    setForm((f) => ({ ...f, seedKey: `${prefix}-${slug}-${suffix}` }));
    setIsSeedRegenerateArmed(false);
  }

  function handleGenerateSeedClick() {
    const hasSeed = form.seedKey.trim().length > 0;
    if (!hasSeed) {
      generateSeedKey();
      return;
    }

    if (!isSeedRegenerateArmed) {
      setIsSeedRegenerateArmed(true);
      setIsError(false);
      setMessage(
        'Seed уже задан. Нажмите «Сгенерировать» еще раз, чтобы подтвердить перегенерацию.',
      );
      return;
    }

    setIsSeedRegenerateArmed(false);
    setShowSeedRegenerateModal(true);
  }

  async function refreshList() {
    const res = await listExercisesAction({
      limit: 150,
      offset: 0,
      query: listQuery,
      type: listTypeFilter,
      qualityStatus: listStatusFilter,
      examType: listExamTypeFilter,
    });
    if (res.success) {
      setItems(res.items as ListItem[]);
      setNextOffset(res.nextOffset ?? (res.items?.length ?? 0));
      setHasMore(Boolean(res.hasMore));
      setTotalItems(Number(res.total ?? res.items.length));
    }
  }

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const res = await listExercisesAction({
      limit: 150,
      offset: nextOffset,
      query: listQuery,
      type: listTypeFilter,
      qualityStatus: listStatusFilter,
      examType: listExamTypeFilter,
    });
    if (res.success) {
      const incoming = (res.items as ListItem[]) ?? [];
      setItems((prev) => {
        const merged = [...prev];
        const known = new Set(prev.map((i) => i.id));
        for (const item of incoming) {
          if (!known.has(item.id)) merged.push(item);
        }
        return merged;
      });
      setNextOffset(res.nextOffset ?? (nextOffset + incoming.length));
      setHasMore(Boolean(res.hasMore));
      setTotalItems(Number(res.total ?? totalItems));
    }
    setLoadingMore(false);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshList();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery, listTypeFilter, listStatusFilter, listExamTypeFilter]);

  useEffect(() => {
    if (!isSeedRegenerateArmed) return;
    const timer = setTimeout(() => setIsSeedRegenerateArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [isSeedRegenerateArmed]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getExerciseTypeOptionsAction();
      if (!cancelled && res.success && Array.isArray(res.items) && res.items.length > 0) {
        setTypeOptions(res.items as Form['type'][]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadExercise(id: number) {
    const res = await getExerciseByIdAction(id);
    if (!res.success || !res.item) return;

    const item = res.item as Record<string, unknown>;
    const nextForm: Form = {
      id: item.id as number,
      type: item.type as Form['type'],
      seedKey: String(item.seedKey ?? ''),
      category: item.category as ExerciseCategory,
      difficulty: item.difficulty as 1 | 2,
      qualityStatus: item.qualityStatus as Form['qualityStatus'],
      prompt: String(item.prompt ?? ''),
      explanation: String(item.explanation ?? ''),
      skillTags: Array.isArray(item.skillTags)
        ? (item.skillTags as string[]).join(', ')
        : '',
      sourceAlignment: String(item.sourceAlignment ?? ''),
      typicalMistake: String(item.typicalMistake ?? ''),
      algorithmSteps: Array.isArray(item.algorithmSteps)
        ? (item.algorithmSteps as string[]).join('\n')
        : '',
      isActive: Boolean(item.isActive),
      options: Array.isArray(item.options) ? (item.options as string[]) : ['', ''],
      correctOptionIndex: Number(item.correctOptionIndex ?? 0),
      multiCorrectOptionIndexes: Array.isArray(item.multiCorrectOptionIndexes)
        ? (item.multiCorrectOptionIndexes as number[]).join(', ')
        : '',
      fillBefore: String(item.fillBefore ?? ''),
      fillAfter: String(item.fillAfter ?? ''),
      fillAccepted: Array.isArray(item.fillAccepted)
        ? (item.fillAccepted as string[]).join(', ')
        : '',
      fillCaseSensitive: Boolean(item.fillCaseSensitive),
      wordBankTextWithSlots: String(item.wordBankTextWithSlots ?? ''),
      wordBankWords: Array.isArray(item.wordBankWords)
        ? (item.wordBankWords as string[]).join('\n')
        : '',
      wordBankCorrectBySlot: Array.isArray(item.wordBankCorrectBySlot)
        ? (item.wordBankCorrectBySlot as string[]).join('\n')
        : '',
      wordBankCaseSensitive: Boolean(item.wordBankCaseSensitive),
      wordSearchGridRows: Array.isArray(item.wordSearchGridRows)
        ? (item.wordSearchGridRows as string[]).join('\n')
        : '',
      wordSearchWords: Array.isArray(item.wordSearchWords)
        ? (item.wordSearchWords as string[]).join('\n')
        : '',
      wordSearchCaseSensitive: Boolean(item.wordSearchCaseSensitive),
      orderFragments: Array.isArray(item.orderFragments)
        ? (item.orderFragments as Array<{ id: string; text: string }>)
            .map((f) => `${f.id} | ${f.text}`)
            .join('\n')
        : '',
      orderCorrectOrder: Array.isArray(item.orderCorrectOrder)
        ? (item.orderCorrectOrder as string[]).join(', ')
        : '',
      punctuationTokens: Array.isArray(item.punctuationTokens)
        ? (item.punctuationTokens as string[]).join(' | ')
        : '',
      punctuationAllowedMarks: Array.isArray(item.punctuationAllowedMarks)
        ? (item.punctuationAllowedMarks as string[]).join(', ')
        : ',',
      punctuationMarks: Array.isArray(item.punctuationMarks)
        ? (item.punctuationMarks as Array<{ afterTokenIndex: number; mark: string }>)
            .map((mark) => `${mark.afterTokenIndex}:${mark.mark}`)
            .join(', ')
        : '',
      ege20TextWithSlots: String(item.ege20TextWithSlots ?? ''),
      ege20Slots: Array.isArray(item.ege20Slots)
        ? (item.ege20Slots as number[]).join(', ')
        : '',
      ege20TargetSet: Array.isArray(item.ege20TargetSet)
        ? (item.ege20TargetSet as number[]).join(', ')
        : '',
      ege21TargetPunctuation: ((item.ege21TargetPunctuation as
        | 'comma'
        | 'dash'
        | 'colon'
        | 'semicolon'
        | undefined) ?? 'comma'),
      ege21Sentences: Array.isArray(item.ege21Sentences)
        ? (item.ege21Sentences as Array<{ index: number; text: string }>)
            .map((s) => `${s.index}. ${s.text}`)
            .join('\n')
        : '',
      ege21TargetSet: Array.isArray(item.ege21TargetSet)
        ? (item.ege21TargetSet as number[]).join(', ')
        : '',
    };
    setForm(loadFormState(id, nextForm));
    setSelectedId(id);
    setMessage('');
    setIsSeedRegenerateArmed(false);
    setShowSeedRegenerateModal(false);
  }

  function parsePunctuationMarks(raw: string) {
    return raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map((entry) => {
        const [idx, mark] = entry.split(':').map((v) => v.trim());
        return {
          afterTokenIndex: Number(idx),
          mark: mark as PMark,
        };
      })
      .filter(
        (v) =>
          Number.isInteger(v.afterTokenIndex) &&
          v.afterTokenIndex >= 0 &&
          v.mark.length > 0,
      );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setIsError(false);

    const payload: ExerciseEditorInput = {
      id: form.id,
      type: form.type,
      seedKey: form.seedKey || undefined,
      category: form.category,
      difficulty: form.difficulty,
      qualityStatus: form.qualityStatus,
      prompt: form.prompt,
      explanation: form.explanation,
      skillTags: parsedSkillTags,
      sourceAlignment: form.sourceAlignment || undefined,
      typicalMistake: form.typicalMistake || undefined,
      algorithmSteps: parsedSteps,
      isActive: form.isActive,
      options:
        form.type === 'multiple_choice' || form.type === 'ege_multi_select'
          ? form.options
          : undefined,
      correctOptionIndex:
        form.type === 'multiple_choice' ? form.correctOptionIndex : undefined,
      multiCorrectOptionIndexes:
        form.type === 'ege_multi_select'
          ? form.multiCorrectOptionIndexes
              .split(',')
              .map((v) => Number(v.trim()))
              .filter((v) => Number.isInteger(v) && v > 0)
          : undefined,
      fillBefore: form.type === 'fill_blank' ? form.fillBefore : undefined,
      fillAfter: form.type === 'fill_blank' ? form.fillAfter : undefined,
      fillAccepted:
        form.type === 'fill_blank'
          ? form.fillAccepted.split(',').map((v) => v.trim()).filter(Boolean)
          : undefined,
      fillCaseSensitive:
        form.type === 'fill_blank' ? form.fillCaseSensitive : undefined,
      wordBankTextWithSlots:
        form.type === 'word_bank_cloze' ? form.wordBankTextWithSlots : undefined,
      wordBankWords:
        form.type === 'word_bank_cloze'
          ? form.wordBankWords.split('\n').map((v) => v.trim()).filter(Boolean)
          : undefined,
      wordBankCorrectBySlot:
        form.type === 'word_bank_cloze'
          ? form.wordBankCorrectBySlot
              .split('\n')
              .map((v) => v.trim())
              .filter(Boolean)
          : undefined,
      wordBankCaseSensitive:
        form.type === 'word_bank_cloze' ? form.wordBankCaseSensitive : undefined,
      wordSearchGridRows:
        form.type === 'word_search'
          ? form.wordSearchGridRows.split('\n').map((v) => v.trim()).filter(Boolean)
          : undefined,
      wordSearchWords:
        form.type === 'word_search'
          ? form.wordSearchWords.split('\n').map((v) => v.trim()).filter(Boolean)
          : undefined,
      wordSearchCaseSensitive:
        form.type === 'word_search' ? form.wordSearchCaseSensitive : undefined,
      orderFragments:
        form.type === 'order_fragments'
          ? form.orderFragments
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, idx) => {
                const m = line.match(/^([^|]+)\|(.+)$/);
                if (m) return { id: m[1].trim(), text: m[2].trim() };
                return { id: `f${idx + 1}`, text: line };
              })
              .filter((f) => f.id.length > 0 && f.text.length > 0)
          : undefined,
      orderCorrectOrder:
        form.type === 'order_fragments'
          ? form.orderCorrectOrder
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
          : undefined,
      punctuationTokens:
        form.type === 'punctuation_insert'
          ? form.punctuationTokens.split('|').map((v) => v.trim()).filter(Boolean)
          : undefined,
      punctuationAllowedMarks:
        form.type === 'punctuation_insert'
          ? (form.punctuationAllowedMarks
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean) as PMark[])
          : undefined,
      punctuationMarks:
        form.type === 'punctuation_insert'
          ? parsePunctuationMarks(form.punctuationMarks)
          : undefined,
      ege20TextWithSlots:
        form.type === 'ege20_complex_sentence_punctuation'
          ? form.ege20TextWithSlots
          : undefined,
      ege20Slots:
        form.type === 'ege20_complex_sentence_punctuation'
          ? parseIndexCsv(form.ege20Slots)
          : undefined,
      ege20TargetSet:
        form.type === 'ege20_complex_sentence_punctuation'
          ? parseIndexCsv(form.ege20TargetSet)
          : undefined,
      ege21TargetPunctuation:
        form.type === 'ege21_punctuation_analysis'
          ? form.ege21TargetPunctuation
          : undefined,
      ege21Sentences:
        form.type === 'ege21_punctuation_analysis'
          ? parseEge21SentencesText(form.ege21Sentences)
          : undefined,
      ege21TargetSet:
        form.type === 'ege21_punctuation_analysis'
          ? parseIndexCsv(form.ege21TargetSet)
          : undefined,
    };

    const res = isEdit
      ? await updateExerciseAction({ ...payload, id: form.id! })
      : await createExerciseAction(payload);

    if (res.success) {
      setMessage(isEdit ? 'Изменения сохранены.' : 'Задание создано.');
      localStorage.removeItem(getDraftKey(form.id));
      setForm(isEdit ? form : loadFormState(null, EMPTY));
      await refreshList();
    } else {
      setIsError(true);
      setMessage(res.error || 'Ошибка сохранения.');
    }

    setSaving(false);
  }

  async function handleDeleteExercise() {
    if (!isEdit || deleting) return;
    const label = form.seedKey.trim() || `#${form.id}`;
    const confirmed = window.confirm(
      `Удалить упражнение ${label}? Это действие также удалит связанные попытки и не может быть отменено.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setMessage('');
    setIsError(false);

    const res = await deleteExerciseAction(form.id!);
    if (res.success) {
      setMessage('Задание удалено.');
      localStorage.removeItem(getDraftKey(form.id));
      setForm(loadFormState(null, EMPTY));
      setSelectedId(null);
      setPreviewCheckResult(null);
      setIsSeedRegenerateArmed(false);
      setShowSeedRegenerateModal(false);
      await refreshList();
    } else {
      setIsError(true);
      setMessage(res.error || 'Ошибка удаления.');
    }

    setDeleting(false);
  }

  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-5 items-start xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm max-h-[60vh] xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Задания · {totalItems}</h3>
          <button
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            onClick={() => void refreshList()}
          >
            Обновить
          </button>
        </div>
        <div className="mb-3 space-y-2">
          <input
            className={inputClass}
            placeholder="Поиск: id / seed_key / текст"
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className={inputClass}
              value={listTypeFilter}
              onChange={(e) => setListTypeFilter(e.target.value)}
            >
              {listTypes.map((type) => (
                <option key={type} value={type}>
                  {type === 'all' ? 'Все типы' : type}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              value={listExamTypeFilter}
              onChange={(e) => setListExamTypeFilter(e.target.value)}
            >
              {listExamTypes.map((n) => (
                <option key={n} value={n}>
                  {n === 'all' ? 'ЕГЭ: все' : `ЕГЭ: ${n}`}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <select
              className={inputClass}
              value={listStatusFilter}
              onChange={(e) => setListStatusFilter(e.target.value)}
            >
              <option value="all">Все статусы</option>
              {qualityStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
          {groupedItems.map(([type, typeItems]) => (
            <div key={type} className="space-y-2">
              <div className="sticky top-0 z-10 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                {type} · {typeItems.length}
              </div>
              {typeItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => void loadExercise(item.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedId === item.id
                      ? 'border-slate-900 bg-slate-900/[0.03]'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs text-slate-600">
                    #{item.id} • {item.qualityStatus}
                  </div>
                  <div className="line-clamp-2 text-sm text-slate-900">{item.prompt}</div>
                </button>
              ))}
            </div>
          ))}
          {groupedItems.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
              Ничего не найдено по текущим фильтрам.
            </div>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
            </button>
          )}
        </div>
      </aside>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            {isEdit ? 'Редактирование задания' : 'Создание задания'}
          </h2>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            onClick={() => {
              setForm(loadFormState(null, EMPTY));
              setSelectedId(null);
              setMessage('');
              setIsSeedRegenerateArmed(false);
              setShowSeedRegenerateModal(false);
            }}
          >
            Новый черновик
          </button>
        </div>

        {message && (
          <div
            className={`fixed bottom-6 right-6 z-50 mb-4 rounded-xl border px-6 py-4 text-sm font-medium shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-5 ${
              isError
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {message}
          </div>
        )}

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
          <form onSubmit={onSubmit}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Тип">
                <select
                  className={inputClass}
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Form['type'] }))}
                >
                  {typeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Input>
              <Input label="Категория">
                <select
                  className={inputClass}
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      category: e.target.value as ExerciseCategory,
                    }))
                  }
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </Input>
              <Input label="Сложность">
                <select
                  className={inputClass}
                  value={String(form.difficulty)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, difficulty: Number(e.target.value) as 1 | 2 }))
                  }
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </Input>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input label="Seed key">
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    value={form.seedKey}
                    onChange={(e) => {
                      setIsSeedRegenerateArmed(false);
                      setForm((f) => ({ ...f, seedKey: e.target.value }));
                    }}
                    placeholder="e.g. ege21-task-abc123ef"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateSeedClick}
                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    title="Сгенерировать seed key"
                  >
                    Сгенерировать
                  </button>
                </div>
              </Input>
              <Input label="Skill tags">
                <input
                  className={inputClass}
                  value={form.skillTags}
                  onChange={(e) => setForm((f) => ({ ...f, skillTags: e.target.value }))}
                />
              </Input>
            </div>

            <div className="mt-3">
              <div className="mb-1 text-sm font-medium text-slate-700">Формулировка</div>
              <MDEditor
                value={form.prompt}
                onChange={(val) => setForm((f) => ({ ...f, prompt: val || '' }))}
                data-color-mode="light"
                className="w-full"
              />
            </div>
            <div className="mt-3">
              <div className="mb-1 text-sm font-medium text-slate-700">Объяснение</div>
              <MDEditor
                value={form.explanation}
                onChange={(val) => setForm((f) => ({ ...f, explanation: val || '' }))}
                data-color-mode="light"
                className="w-full"
              />
            </div>

            {(form.type === 'multiple_choice' || form.type === 'ege_multi_select') && (
              <div className="mt-3 space-y-2">
                <div className="text-sm font-medium text-slate-700">Варианты ответа</div>
                {form.options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    {form.type === 'multiple_choice' ? (
                      <input
                        type="radio"
                        checked={form.correctOptionIndex === index}
                        onChange={() => setForm((f) => ({ ...f, correctOptionIndex: index }))}
                      />
                    ) : (
                      <span className="inline-flex w-5 justify-center text-xs font-semibold text-slate-500">
                        {index + 1}
                      </span>
                    )}
                    <input
                      className={inputClass}
                      value={option}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          options: f.options.map((value, idx) =>
                            idx === index ? e.target.value : value,
                          ),
                        }))
                      }
                    />
                    {form.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => {
                            const newOptions = f.options.filter((_, idx) => idx !== index);
                            let newCorrect = f.correctOptionIndex;
                            if (newCorrect === index) newCorrect = 0;
                            else if (newCorrect > index) newCorrect--;
                            return { ...f, options: newOptions, correctOptionIndex: newCorrect };
                          })
                        }
                        className="p-1 text-slate-400 transition hover:text-red-500"
                        title="Удалить вариант"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  onClick={() => setForm((f) => ({ ...f, options: [...f.options, ''] }))}
                >
                  Добавить вариант
                </button>
                {form.type === 'ege_multi_select' && (
                  <Input label="Правильные номера (через запятую)" className="mt-2">
                    <input
                      className={inputClass}
                      value={form.multiCorrectOptionIndexes}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, multiCorrectOptionIndexes: e.target.value }))
                      }
                    />
                  </Input>
                )}
              </div>
            )}

            {form.type === 'fill_blank' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input label="Текст до пропуска">
                  <input
                    className={inputClass}
                    value={form.fillBefore}
                    onChange={(e) => setForm((f) => ({ ...f, fillBefore: e.target.value }))}
                  />
                </Input>
                <Input label="Текст после пропуска">
                  <input
                    className={inputClass}
                    value={form.fillAfter}
                    onChange={(e) => setForm((f) => ({ ...f, fillAfter: e.target.value }))}
                  />
                </Input>
                <Input label="Допустимые ответы (через запятую)" className="sm:col-span-2">
                  <input
                    className={inputClass}
                    value={form.fillAccepted}
                    onChange={(e) => setForm((f) => ({ ...f, fillAccepted: e.target.value }))}
                  />
                </Input>
              </div>
            )}

            {form.type === 'word_bank_cloze' && (
              <div className="mt-3 space-y-3">
                <Input label="Текст со слотами ([[1]], [[2]], ...)">
                  <textarea
                    className={inputClass}
                    rows={4}
                    value={form.wordBankTextWithSlots}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, wordBankTextWithSlots: e.target.value }))
                    }
                    placeholder="Я [[1]] из дома и [[2]] зонт."
                  />
                </Input>
                <Input label="Банк слов (по одному на строку)">
                  <textarea
                    className={inputClass}
                    rows={4}
                    value={form.wordBankWords}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, wordBankWords: e.target.value }))
                    }
                    placeholder={'вышел\nвзял\nувидел'}
                  />
                </Input>
                <Input label="Правильные слова по слотам (по одному на строку)">
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={form.wordBankCorrectBySlot}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, wordBankCorrectBySlot: e.target.value }))
                    }
                    placeholder={'вышел\nвзял'}
                  />
                </Input>
              </div>
            )}

            {form.type === 'word_search' && (
              <div className="mt-3 space-y-3">
                <Input label="Сетка (каждая строка — строка букв)">
                  <textarea
                    className={inputClass}
                    rows={6}
                    value={form.wordSearchGridRows}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, wordSearchGridRows: e.target.value }))
                    }
                    placeholder={'документы\nпколняьт\nрсвязаяв'}
                  />
                </Input>
                <Input label="Скрытые слова (по одному на строку)">
                  <textarea
                    className={inputClass}
                    rows={4}
                    value={form.wordSearchWords}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, wordSearchWords: e.target.value }))
                    }
                    placeholder={'договор\nзаявление\nакт'}
                  />
                </Input>
              </div>
            )}

            {form.type === 'order_fragments' && (
              <div className="mt-3 space-y-3">
                <Input label="Фрагменты (каждая строка: id | text)">
                  <textarea
                    className={inputClass}
                    rows={5}
                    value={form.orderFragments}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, orderFragments: e.target.value }))
                    }
                    placeholder={'f1 | Первый фрагмент\nf2 | Второй фрагмент'}
                  />
                </Input>
                <Input label="Правильный порядок id (через запятую)">
                  <input
                    className={inputClass}
                    value={form.orderCorrectOrder}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, orderCorrectOrder: e.target.value }))
                    }
                    placeholder="f2, f1"
                  />
                </Input>
              </div>
            )}

            {form.type === 'punctuation_insert' && (
              <div className="mt-3 space-y-3">
                <Input label="Токены предложения (через |)">
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={form.punctuationTokens}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, punctuationTokens: e.target.value }))
                    }
                  />
                </Input>
                <Input label="Допустимые знаки (через запятую)">
                  <input
                    className={inputClass}
                    value={form.punctuationAllowedMarks}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, punctuationAllowedMarks: e.target.value }))
                    }
                  />
                </Input>
                <Input label="Правильные позиции (индекс:знак)">
                  <input
                    className={inputClass}
                    value={form.punctuationMarks}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, punctuationMarks: e.target.value }))
                    }
                  />
                </Input>
              </div>
            )}

            {form.type === 'ege20_complex_sentence_punctuation' && (
              <div className="mt-3 space-y-3">
                <Input label="Текст со слотами (например: ... (1) ... (2) ...)">
                  <textarea
                    className={inputClass}
                    rows={4}
                    value={form.ege20TextWithSlots}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, ege20TextWithSlots: e.target.value }))
                    }
                  />
                </Input>
                <Input label="Слоты (через запятую)">
                  <input
                    className={inputClass}
                    value={form.ege20Slots}
                    onChange={(e) => setForm((f) => ({ ...f, ege20Slots: e.target.value }))}
                    placeholder="1, 2, 3, 4"
                  />
                </Input>
                <Input label="Правильные номера (через запятую)">
                  <input
                    className={inputClass}
                    value={form.ege20TargetSet}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, ege20TargetSet: e.target.value }))
                    }
                    placeholder="1, 4"
                  />
                </Input>
              </div>
            )}

            {form.type === 'ege21_punctuation_analysis' && (
              <div className="mt-3 space-y-3">
                <Input label="Целевой знак">
                  <select
                    className={inputClass}
                    value={form.ege21TargetPunctuation}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        ege21TargetPunctuation: e.target.value as Form['ege21TargetPunctuation'],
                      }))
                    }
                  >
                    <option value="comma">comma</option>
                    <option value="dash">dash</option>
                    <option value="colon">colon</option>
                    <option value="semicolon">semicolon</option>
                  </select>
                </Input>
                <Input label="Предложения (каждая строка: index. text)">
                  <textarea
                    className={inputClass}
                    rows={5}
                    value={form.ege21Sentences}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, ege21Sentences: e.target.value }))
                    }
                    placeholder={'1. Первое предложение\n2. Второе предложение'}
                  />
                </Input>
                <Input label="Правильные номера (через запятую)">
                  <input
                    className={inputClass}
                    value={form.ege21TargetSet}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, ege21TargetSet: e.target.value }))
                    }
                    placeholder="1, 3, 5"
                  />
                </Input>
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input label="Source alignment">
                <input
                  className={inputClass}
                  value={form.sourceAlignment}
                  onChange={(e) => setForm((f) => ({ ...f, sourceAlignment: e.target.value }))}
                />
              </Input>
              <Input label="Типичная ошибка">
                <input
                  className={inputClass}
                  value={form.typicalMistake}
                  onChange={(e) => setForm((f) => ({ ...f, typicalMistake: e.target.value }))}
                />
              </Input>
            </div>

            <Input label="Algorithm steps (по строкам)" className="mt-3">
              <textarea
                className={inputClass}
                rows={3}
                value={form.algorithmSteps}
                onChange={(e) => setForm((f) => ({ ...f, algorithmSteps: e.target.value }))}
              />
            </Input>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input label="Статус качества">
                <select
                  className={inputClass}
                  value={form.qualityStatus}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      qualityStatus: e.target.value as Form['qualityStatus'],
                    }))
                  }
                >
                  {qualityStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </Input>
              <Input label="Активность">
                <select
                  className={inputClass}
                  value={form.isActive ? 'active' : 'inactive'}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isActive: e.target.value === 'active' }))
                  }
                >
                  <option value="active">Активно</option>
                  <option value="inactive">Неактивно</option>
                </select>
              </Input>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <button
                disabled={saving || deleting}
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving
                  ? 'Сохранение...'
                  : isEdit
                    ? 'Сохранить изменения'
                    : 'Создать задание'}
              </button>
              {isEdit ? (
                <button
                  type="button"
                  disabled={saving || deleting}
                  onClick={() => void handleDeleteExercise()}
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleting ? 'Удаление...' : 'Удалить'}
                </button>
              ) : null}
            </div>
          </form>

          <div className="h-fit rounded-2xl border border-slate-200 bg-slate-50 p-4 2xl:sticky 2xl:top-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Превью в чате</h3>
              <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewMode('desktop')}
                  className={`rounded px-2 py-1 ${
                    previewMode === 'desktop'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('mobile')}
                  className={`rounded px-2 py-1 ${
                    previewMode === 'mobile'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Mobile
                </button>
              </div>
            </div>
            {preview.error ? (
              <p className="text-sm text-amber-700">Превью недоступно: {preview.error}</p>
            ) : preview.exercise ? (
              <div className={previewMode === 'mobile' ? 'mx-auto w-[320px] max-w-full' : 'w-full'}>
                <div className="mb-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-800 shadow-sm [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_p]:mb-2 [&_p:last-child]:mb-0">
                  <ReactMarkdown>{preview.exercise.prompt}</ReactMarkdown>
                </div>
                <ExerciseRenderer exercise={preview.exercise} onSubmit={handlePreviewSubmit} />
                {previewCheckResult && (
                  <div
                    className={`mt-3 rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap ${
                      previewCheckResult.isCorrect
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                  >
                    {previewFeedbackSections ? (
                      <div className="space-y-3">
                        {previewFeedbackSections.lead ? (
                          <ReactMarkdown>{previewFeedbackSections.lead}</ReactMarkdown>
                        ) : null}
                        <div className="rounded-xl border border-emerald-200 bg-emerald-100/60 px-3 py-2">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                            Правильный ответ
                          </div>
                          <ReactMarkdown>{previewFeedbackSections.correctAnswer}</ReactMarkdown>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                            Объяснение
                          </div>
                          <ReactMarkdown>
                            {escapeMarkdownParenListMarkers(previewFeedbackSections.explanation)}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <ReactMarkdown>{previewCheckResult.text}</ReactMarkdown>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Заполните поля задания для превью.</p>
            )}
          </div>
        </div>
      </div>

      {showSeedRegenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h4 className="text-base font-semibold text-slate-900">Подтверждение</h4>
            <p className="mt-2 text-sm text-slate-700">
              Вы уверены, что хотите перегенерировать сид?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setShowSeedRegenerateModal(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={() => {
                  generateSeedKey();
                  setShowSeedRegenerateModal(false);
                }}
              >
                Перегенерировать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Input({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
      {children}
    </label>
  );
}

function parseIndexCsv(raw: string) {
  return raw
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
}

function parseEge21SentencesText(raw: string): Array<{ index: number; text: string }> {
  const text = raw.trim();
  if (!text) return [];

  // Supports both line-by-line format:
  //   1. ...
  //   2) ...
  // and inline format:
  //   1. ... 2) ... 3) ...
  const marker = /\(?(\d{1,2})\)?\s*[.)\-:]\s*/g;
  const points: Array<{ idx: number; start: number; markerEnd: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = marker.exec(text)) !== null) {
    points.push({
      idx: Number(m[1]),
      start: m.index,
      markerEnd: marker.lastIndex,
    });
  }

  if (points.length === 0) return [];

  const out: Array<{ index: number; text: string }> = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const body = text.slice(current.markerEnd, next ? next.start : text.length).trim();
    if (!Number.isInteger(current.idx) || current.idx <= 0 || !body) continue;
    out.push({ index: current.idx, text: body });
  }

  return out.sort((a, b) => a.index - b.index);
}


'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { commands, type ICommand } from '@uiw/react-md-editor';
import FormattedFeedbackExplanation from '@/components/FormattedFeedbackExplanation';
import { useTheme } from '@/components/theme-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, CheckSquare, Search, ArrowUp, ArrowDown, X, XSquare, History } from "lucide-react";
import rehypeRaw from 'rehype-raw';
import { buildDictationFeedbackText } from '@/features/exercises/dictationFeedback';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import {
 batchUpdateExercisesMetaAction,
 createExerciseAction,
 deleteExerciseAction,
 previewRawNormalizationAction,
 updateExerciseAction,
 type ExerciseEditorInput,
} from '@/app/actions/admin';
import ExerciseRenderer from '@/features/exercises/renderers/ExerciseRenderer';
import { checkExerciseAnswer } from '@/features/exercises/checkers';
import { formatAdminDateTime, formatAdminTime } from '@/lib/date-time';
import {
 buildFillBlankQuestionText,
 describeAnswerTransfer,
 extractOptionsFromQuestionText,
 extractPromptFromQuestionText,
 normalizeNumberAnswerSignature,
 parseFillAcceptedSignature,
 parseIndexCsv,
 serializeMultiAnswerForFillBlank,
 stripEge18PromptFromFillBefore,
} from '@/lib/exercise-type-conversion';
import {
 exerciseSchema,
 type Exercise,
 type SubmittedAnswer,
} from '@/features/exercises/schemas';
import { EXERCISE_TYPES, type ExerciseCategory } from '@/features/exercises/types';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
 ssr: false,
 loading: () => (
 <div className="admin-md-skeleton h-[205px] rounded-lg border border-stroke bg-surface-strong p-3">
 <div className="admin-md-skeleton-bar mb-3 h-8 w-full rounded-md bg-slate-100 dark:bg-slate-800" />
 <div className="admin-md-skeleton-panel h-[147px] w-full rounded-md bg-surface dark:bg-slate-800/70" />
 </div>
 ),
});

type TextSelState = {
 selectedText: string;
 text: string;
 selection: { start: number; end: number };
};

function selectWord(params: {
 text: string;
 selection: { start: number; end: number };
 prefix: string;
 suffix?: string;
}) {
 const { text, selection, prefix } = params;
 const suffix = params.suffix ?? prefix;
 const result = { ...selection };

 if (text && text.length && selection.start === selection.end) {
 const isWordDelimiter = (c: string) => c === ' ' || c.charCodeAt(0) === 10;
 let start = 0;
 let end = text.length;
 for (let i = selection.start; i - 1 > -1; i--) {
 if (isWordDelimiter(text[i - 1])) {
 start = i;
 break;
 }
 }
 for (let i = selection.start; i < text.length; i++) {
 if (isWordDelimiter(text[i])) {
 end = i;
 break;
 }
 }
 result.start = start;
 result.end = end;
 }

 if (result.start >= prefix.length && result.end <= text.length - suffix.length) {
 const wrapped = text.slice(result.start - prefix.length, result.end + suffix.length);
 if (wrapped.startsWith(prefix) && wrapped.endsWith(suffix)) {
 return {
 start: result.start - prefix.length,
 end: result.end + suffix.length,
 };
 }
 }
 return result;
}

function executeMarkdownToggle(params: {
 api: { replaceSelection: (text: string) => void; setSelectionRange: (r: { start: number; end: number }) => void };
 selectedText: string;
 selection: { start: number; end: number };
 prefix: string;
 suffix?: string;
}) {
 const { api, selectedText, selection, prefix } = params;
 const suffix = params.suffix ?? prefix;
 const leading = selectedText.match(/^\s*/u)?.[0] ?? '';
 const trailing = selectedText.match(/\s*$/u)?.[0] ?? '';
 const core = selectedText.slice(leading.length, selectedText.length - trailing.length);

 if (core.startsWith(prefix) && core.endsWith(suffix) && core.length >= prefix.length + suffix.length) {
 const unwrapped = core.slice(prefix.length, suffix.length ? -suffix.length : undefined);
 const next = `${leading}${unwrapped}${trailing}`;
 api.replaceSelection(next);
 api.setSelectionRange({
 start: selection.start + leading.length,
 end: selection.start + leading.length + unwrapped.length,
 });
 return;
 }

 const safeCore = core || 'text';
 const next = `${leading}${prefix}${safeCore}${suffix}${trailing}`;
 api.replaceSelection(next);
 api.setSelectionRange({
 start: selection.start + leading.length + prefix.length,
 end: selection.start + leading.length + prefix.length + safeCore.length,
 });
}

function executeHtmlToggle(params: {
 api: { replaceSelection: (text: string) => void; setSelectionRange: (r: { start: number; end: number }) => void };
 selectedText: string;
 selection: { start: number; end: number };
 openTag: string;
 closeTag: string;
}) {
 const { api, selectedText, selection, openTag, closeTag } = params;
 const leading = selectedText.match(/^\s*/u)?.[0] ?? '';
 const trailing = selectedText.match(/\s*$/u)?.[0] ?? '';
 const core = selectedText.slice(leading.length, selectedText.length - trailing.length);

 if (core.startsWith(openTag) && core.endsWith(closeTag) && core.length >= openTag.length + closeTag.length) {
 const unwrapped = core.slice(openTag.length, -closeTag.length);
 const next = `${leading}${unwrapped}${trailing}`;
 api.replaceSelection(next);
 api.setSelectionRange({
 start: selection.start + leading.length,
 end: selection.start + leading.length + unwrapped.length,
 });
 return;
 }

 const safeCore = core || 'text';
 const next = `${leading}${openTag}${safeCore}${closeTag}${trailing}`;
 api.replaceSelection(next);
 api.setSelectionRange({
 start: selection.start + leading.length + openTag.length,
 end: selection.start + leading.length + openTag.length + safeCore.length,
 });
}

type ActiveMarks = {
 bold: boolean;
 italic: boolean;
 strike: boolean;
 underline: boolean;
 doubleUnderline: boolean;
};

const EMPTY_ACTIVE_MARKS: ActiveMarks = {
 bold: false,
 italic: false,
 strike: false,
 underline: false,
 doubleUnderline: false,
};

function renderEditorMarkdown(value: string) {
 return value
 .replace(/==([\s\S]+?)==/g, '<span style="text-decoration-line: underline; text-decoration-style: double; text-decoration-skip-ink: none;">$1</span>')
 .replace(/\+\+([\s\S]+?)\+\+/g, '<u>$1</u>');
}

function isWrappedSelection(state: TextSelState, prefix: string, suffix = prefix) {
 const { start, end } = state.selection;
 if (start < prefix.length || end + suffix.length > state.text.length) return false;
 return (
 state.text.slice(start - prefix.length, start) === prefix
 && state.text.slice(end, end + suffix.length) === suffix
 );
}

function getActiveMarksFromState(state: TextSelState): ActiveMarks {
 const sample = state.selectedText.length > 0
 ? state.selectedText
 : state.text.slice(Math.max(0, state.selection.start - 24), Math.min(state.text.length, state.selection.end + 24));
 return {
 bold: isWrappedSelection(state, '**') || /\*\*[\s\S]+?\*\*/.test(sample),
 italic: isWrappedSelection(state, '*') || /\*[\s\S]+?\*/.test(sample),
 strike: isWrappedSelection(state, '~~') || /~~[\s\S]+?~~/.test(sample),
 underline:
 isWrappedSelection(state, '<u>', '</u>')
 || /<u>[\s\S]+?<\/u>/.test(sample),
 doubleUnderline:
 isWrappedSelection(state, '<ins class="du">', '</ins>')
 || /<ins class="du">[\s\S]+?<\/ins>/.test(sample),
 };
}

function commandButtonClass(active: boolean) {
 return active ? 'wmde-markdown-active' : undefined;
}

function makeToggleCommand(
 name: string,
 keyCommand: string,
 icon: JSX.Element,
 title: string,
 style: { kind: 'markdown'; prefix: string; suffix?: string } | { kind: 'html'; openTag: string; closeTag: string },
 active: boolean,
): ICommand {
 return {
 name,
 keyCommand,
 buttonProps: {
 'aria-label': title,
 title,
 className: commandButtonClass(active),
 style: active ? { backgroundColor: '#e2e8f0' } : undefined,
 },
 icon,
 prefix: style.kind === 'markdown' ? style.prefix : undefined,
 suffix: style.kind === 'markdown' ? (style.suffix ?? style.prefix) : undefined,
 value: 'text',
 execute: (state, api) => {
 const range = selectWord({
 text: state.text,
 selection: state.selection,
 prefix: style.kind === 'markdown' ? style.prefix : style.openTag,
 suffix: style.kind === 'markdown' ? (style.suffix ?? style.prefix) : style.closeTag,
 });
 const state1 = api.setSelectionRange(range);
 if (style.kind === 'markdown') {
 executeMarkdownToggle({
 api,
 selectedText: state1.selectedText,
 selection: range,
 prefix: style.prefix,
 suffix: style.suffix ?? style.prefix,
 });
 } else {
 executeHtmlToggle({
 api,
 selectedText: state1.selectedText,
 selection: range,
 openTag: style.openTag,
 closeTag: style.closeTag,
 });
 }
 },
 };
}

const markdownExtraCommands = [
 commands.codeEdit,
 commands.codeLive,
 commands.codePreview,
 commands.fullscreen,
];

const categories: ExerciseCategory[] = ['orthography', 'punctuation', 'mixed'];
const qualityStatuses = ['draft', 'review', 'approved', 'archived'] as const;

type PMark = ',' | ':' | ';' | '-' | '—';
type PCMark =
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
 explanation: string;
 searchText?: string;
 qualityStatus: string;
 updatedAt: string;
 updatedAtCursor: string;
 isActive: boolean;
};

type ExerciseListRequest = {
  limit: number;
  offset: number;
  cursorId?: number | null;
  cursorUpdatedAt?: string | null;
  query: string;
  type: string;
  qualityStatus: string;
  examType: string;
  sortBy: 'id' | 'updatedAt';
  sortDir: 'asc' | 'desc';
  includeTotal: boolean;
  signal?: AbortSignal;
};

type ExerciseListResponse = {
  success: boolean;
  error?: string;
  items: ListItem[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
  nextCursorId: number | null;
  nextCursorUpdatedAt: string | null;
};

type ExerciseDetailResponse = {
  success: boolean;
  error?: string;
  item?: Record<string, unknown>;
};

async function fetchExerciseList(input: ExerciseListRequest): Promise<ExerciseListResponse> {
  const params = new URLSearchParams({
    limit: String(input.limit),
    offset: String(input.offset),
    query: input.query,
    type: input.type,
    qualityStatus: input.qualityStatus,
    examType: input.examType,
    sortBy: input.sortBy,
    sortDir: input.sortDir,
    includeTotal: String(input.includeTotal),
  });
  if (input.cursorId) params.set('cursorId', String(input.cursorId));
  if (input.cursorUpdatedAt) params.set('cursorUpdatedAt', input.cursorUpdatedAt);

  const response = await fetch(`/api/admin/exercises?${params.toString()}`, {
    cache: 'no-store',
    signal: input.signal,
  });
  const result = await response.json() as ExerciseListResponse;
  if (response.status === 401) {
    return { ...result, error: 'Сессия администратора истекла. Обновите страницу и войдите снова.' };
  }
  return result;
}

async function fetchExerciseById(id: number): Promise<ExerciseDetailResponse> {
  const response = await fetch(`/api/admin/exercises/${id}`, { cache: 'no-store' });
  const result = await response.json() as ExerciseDetailResponse;
  if (response.status === 401) {
    return { ...result, error: 'Сессия администратора истекла. Обновите страницу и войдите снова.' };
  }
  return result;
}

function getExerciseIdFromHash(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const id = Number(params.get('exercise') ?? NaN);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getExerciseIdFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const id = Number(params.get('exercise') ?? params.get('id') ?? params.get('exerciseId') ?? NaN);
  return Number.isInteger(id) && id > 0 ? id : null;
}

type RawPreviewItem = {
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

type AdminFormProps = {
 initialItems: ListItem[];
 initialTotalItems?: number | null;
 initialSelectedId?: number | null;
 initialSelectedExercise?: Record<string, unknown> | null;
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
 dictationTitle: string;
 dictationAudioSrc: string;
 dictationPlaybackRates: string;
 dictationText: string;
 dictationCaseSensitive: boolean;
 dictationIgnorePunctuation: boolean;
 orthographyRepairText: string;
 orthographyRepairMode: 'click_then_choose' | 'click_then_type';
 orthographyRepairTargets: string;
 orthographyRepairHints: string;
 orthographyRepairRepairs: string;
 orthographyRepairCorrectText: string;
 orderFragments: string;
 orderCorrectOrder: string;
 punctuationTokens: string;
 punctuationAllowedMarks: string;
 punctuationMarks: string;
 punctuationConstructorTokens: string;
 punctuationConstructorMarkBank: string;
 punctuationConstructorHints: string;
 punctuationConstructorGuidedSteps: string;
 punctuationConstructorSegments: string;
 punctuationConstructorPlacements: string;
 punctuationConstructorSlotExplanations: string;
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
 dictationTitle: '',
 dictationAudioSrc: '',
 dictationPlaybackRates: '0.75, 1, 1.25, 1.5',
 dictationText: '',
 dictationCaseSensitive: false,
 dictationIgnorePunctuation: false,
 orthographyRepairText: '',
 orthographyRepairMode: 'click_then_choose',
 orthographyRepairTargets: '',
 orthographyRepairHints: '',
 orthographyRepairRepairs: '',
 orthographyRepairCorrectText: '',
 orderFragments: '',
 orderCorrectOrder: '',
 punctuationTokens: '',
 punctuationAllowedMarks: ',',
 punctuationMarks: '',
 punctuationConstructorTokens: '',
 punctuationConstructorMarkBank: 'period, comma, semicolon, colon, question, exclamation, quote_open, quote_close, paren_open, paren_close, dash, ellipsis',
 punctuationConstructorHints: '',
 punctuationConstructorGuidedSteps: '',
 punctuationConstructorSegments: '',
 punctuationConstructorPlacements: '',
 punctuationConstructorSlotExplanations: '',
 ege20TextWithSlots: '',
 ege20Slots: '',
 ege20TargetSet: '',
 ege21TargetPunctuation: 'comma',
 ege21Sentences: '',
 ege21TargetSet: '',
};

const inputClass = 'w-full rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

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
 case 'dictation':
 return 'dict';
 case 'orthography_repair':
 return 'or';
 case 'punctuation_insert':
 return 'punc';
 case 'punctuation_constructor':
 return 'pc';
 default:
 return 'mc';
 }
}

function convertFormForTypeChange(form: Form, nextType: Form['type']): Form {
 if (form.type === nextType) return form;

 if (form.type === 'ege_multi_select' && nextType === 'fill_blank') {
 const signature = serializeMultiAnswerForFillBlank(form.multiCorrectOptionIndexes);
 const fillBefore =
 form.fillBefore.trim() || buildFillBlankQuestionText(form.prompt, form.options);
 return {
 ...form,
 type: nextType,
 fillBefore,
 fillAfter: form.fillAfter,
 fillAccepted: form.fillAccepted.trim() || signature,
 };
 }

 if (form.type === 'fill_blank' && nextType === 'ege_multi_select') {
 const sourceText = form.fillBefore.trim() || form.prompt.trim();
 const parsedPrompt = extractPromptFromQuestionText(sourceText);
 const parsedOptions = extractOptionsFromQuestionText(sourceText);
 const multiCorrectOptionIndexes =
 form.multiCorrectOptionIndexes.trim() || parseFillAcceptedSignature(form.fillAccepted);
 return {
 ...form,
 type: nextType,
 prompt: parsedPrompt || form.prompt,
 options: parsedOptions.length >= 2 ? parsedOptions : form.options,
 multiCorrectOptionIndexes,
 };
 }

 return {
 ...form,
 type: nextType,
 };
}

function buildTypeChangeMessage(previousForm: Form, nextForm: Form) {
 if (previousForm.type === nextForm.type) return '';

 if (previousForm.type === 'ege_multi_select' && nextForm.type === 'fill_blank') {
 return describeAnswerTransfer(
 previousForm.type,
 nextForm.type,
 previousForm.multiCorrectOptionIndexes,
 nextForm.fillAccepted,
 );
 }

 if (previousForm.type === 'fill_blank' && nextForm.type === 'ege_multi_select') {
 return describeAnswerTransfer(
 previousForm.type,
 nextForm.type,
 previousForm.fillAccepted,
 nextForm.multiCorrectOptionIndexes,
 );
 }

 return '';
}

function slugFromPrompt(prompt: string) {
 const translitMap: Record<string, string> = {
 а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
 к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
 х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
 };
 const transliterated = prompt
 .toLowerCase()
 .split('')
 .map((ch) => translitMap[ch] ?? ch)
 .join('');
 const cleaned = transliterated
 .toLowerCase()
 .replace(/[^a-z0-9\s-]+/g, ' ')
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

function shouldStripEge18FillBeforePrompt(form: Pick<Form, 'type' | 'skillTags'>) {
 return (
 form.type === 'fill_blank' &&
 form.skillTags
 .split(',')
 .map((tag) => tag.trim())
 .includes('ege.18')
 );
}

function normalizeFormForEditor(form: Form): Form {
 const nextForm = shouldStripEge18FillBeforePrompt(form)
 ? {
 ...form,
 fillBefore: stripEge18PromptFromFillBefore(form.fillBefore, form.prompt),
 }
 : form;

 if (!shouldNormalizeEge10Form(nextForm)) return nextForm;
 const explanationRows = extractNumberedExplanationRows(nextForm.explanation).map(
 normalizeMorphemeMarkdownSpacing,
 );
 const rows = splitEge10FeedbackRows(explanationRows, nextForm.options.length);
 return {
 ...nextForm,
 explanation: rows.explanationRows.length
 ? rows.explanationRows.join('\n')
 : normalizeMorphemeMarkdownSpacing(nextForm.explanation),
 };
}

function getDraftKey(id?: number | string | null) {
 return id ? `admin_form_draft_${id}` : 'admin_form_draft_new';
}

type StoredDraftEnvelope = {
 sessionId: string | null;
 savedAt: string;
 form: Form;
};

function randomDraftSessionId() {
 if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
 return crypto.randomUUID();
 }
 return `draft_${Math.random().toString(36).slice(2, 10)}`;
}

function getDraftSessionId() {
  if (typeof window === 'undefined') return null;
  const key = 'admin_draft_session_id';
  const existing = window.sessionStorage.getItem(key);
 if (existing) return existing;
 const nextValue = randomDraftSessionId();
  window.sessionStorage.setItem(key, nextValue);
  return nextValue;
}

function logDraftRecoveryDebug(event: string, details?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  console.info(`[admin-draft] ${event}`, details ?? {});
}

function parseStoredDraft(raw: string, targetId: number | null) {
 try {
 const parsed = JSON.parse(raw) as Form | StoredDraftEnvelope;
 if (!parsed || typeof parsed !== 'object') return null;

 if ('form' in parsed) {
 const form = parsed.form;
 if (!form || typeof form !== 'object') return null;
 if (targetId !== null && form.id !== targetId) return null;
 return {
 form: normalizeFormForEditor(form),
 sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
 };
 }

 if (targetId !== null && parsed.id !== targetId) return null;
 return {
 form: normalizeFormForEditor(parsed as Form),
 sessionId: null,
 };
 } catch {
 return null;
 }
}

function writeStoredDraft(targetId: number | null, form: Form) {
  if (typeof window === 'undefined') return;
  const sessionId = getDraftSessionId();
  const envelope: StoredDraftEnvelope = {
    sessionId,
    savedAt: new Date().toISOString(),
    form,
  };
  window.localStorage.setItem(getDraftKey(targetId), JSON.stringify(envelope));
  logDraftRecoveryDebug('writeStoredDraft', {
    targetId,
    formId: form.id ?? null,
    sessionId,
    type: form.type,
  });
}

function loadFormState(targetId: number | null, baseForm: Form) {
 if (targetId != null) {
 return normalizeFormForEditor(baseForm);
 }
 const key = getDraftKey(targetId);
 const draft = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
 if (draft) {
  try {
 const parsed = parseStoredDraft(draft, targetId);
 if (parsed) {
 return parsed.form;
 }
 } catch (e) {
 console.error(`Failed to parse ${key}`, e);
 }
 }
 return normalizeFormForEditor(baseForm);
}

function readStoredDraft(targetId: number | null) {
 const raw = typeof window !== 'undefined' ? localStorage.getItem(getDraftKey(targetId)) : null;
 if (!raw) return null;
 try {
 const parsed = parseStoredDraft(raw, targetId);
 return parsed;
 } catch (error) {
 console.error(`Failed to parse ${getDraftKey(targetId)}`, error);
 return null;
 }
}

function formatUpdatedAt(value: string) {
 return formatAdminDateTime(value);
}

function formFromExerciseItem(item: Record<string, unknown>): Form {
 return {
 id: item.id as number,
 type: item.type as Form['type'],
 seedKey: String(item.seedKey ?? ''),
 category: item.category as ExerciseCategory,
 difficulty: item.difficulty as 1 | 2,
 qualityStatus: item.qualityStatus as Form['qualityStatus'],
 prompt: String(item.prompt ?? ''),
 explanation: String(item.explanation ?? ''),
 skillTags: Array.isArray(item.skillTags) ? (item.skillTags as string[]).join(', ') : '',
 sourceAlignment: String(item.sourceAlignment ?? ''),
 typicalMistake: String(item.typicalMistake ?? ''),
 algorithmSteps: Array.isArray(item.algorithmSteps) ? (item.algorithmSteps as string[]).join('\n') : '',
 isActive: Boolean(item.isActive),
 options: Array.isArray(item.options) ? (item.options as string[]) : ['', ''],
 correctOptionIndex: Number(item.correctOptionIndex ?? 0),
 multiCorrectOptionIndexes: Array.isArray(item.multiCorrectOptionIndexes)
 ? (item.multiCorrectOptionIndexes as number[]).join(', ')
 : '',
 fillBefore: String(item.fillBefore ?? ''),
 fillAfter: String(item.fillAfter ?? ''),
 fillAccepted: Array.isArray(item.fillAccepted) ? (item.fillAccepted as string[]).join(', ') : '',
 fillCaseSensitive: Boolean(item.fillCaseSensitive),
 wordBankTextWithSlots: String(item.wordBankTextWithSlots ?? ''),
 wordBankWords: Array.isArray(item.wordBankWords) ? (item.wordBankWords as string[]).join('\n') : '',
 wordBankCorrectBySlot: Array.isArray(item.wordBankCorrectBySlot)
 ? (item.wordBankCorrectBySlot as string[]).join('\n')
 : '',
 wordBankCaseSensitive: Boolean(item.wordBankCaseSensitive),
 wordSearchGridRows: Array.isArray(item.wordSearchGridRows) ? (item.wordSearchGridRows as string[]).join('\n') : '',
 wordSearchWords: Array.isArray(item.wordSearchWords) ? (item.wordSearchWords as string[]).join('\n') : '',
 wordSearchCaseSensitive: Boolean(item.wordSearchCaseSensitive),
 dictationTitle: String(item.dictationTitle ?? ''),
 dictationAudioSrc: String(item.dictationAudioSrc ?? ''),
 dictationPlaybackRates: Array.isArray(item.dictationPlaybackRates)
 ? (item.dictationPlaybackRates as number[]).join(', ')
 : '0.75, 1, 1.25, 1.5',
 dictationText: String(item.dictationText ?? ''),
 dictationCaseSensitive: Boolean(item.dictationCaseSensitive),
 dictationIgnorePunctuation: Boolean(item.dictationIgnorePunctuation),
 orthographyRepairText: String(item.orthographyRepairText ?? ''),
 orthographyRepairMode:
 (item.orthographyRepairMode as 'click_then_choose' | 'click_then_type' | undefined) ??
 'click_then_choose',
 orthographyRepairTargets: Array.isArray(item.orthographyRepairTargets)
 ? (item.orthographyRepairTargets as Array<{
 id: string;
 surface: string;
 replacement: string;
 type: 'word' | 'span';
 options?: string[];
 occurrence?: number;
 }>)
 .map((target) =>
 [
 target.id,
 target.surface,
 target.replacement,
 target.type,
 (target.options ?? []).join(', '),
 target.occurrence ?? '',
 ].join(' | '),
 )
 .join('\n')
 : '',
 orthographyRepairHints: Array.isArray(item.orthographyRepairHints)
 ? (item.orthographyRepairHints as string[]).join('\n')
 : '',
 orthographyRepairRepairs: Array.isArray(item.orthographyRepairRepairs)
 ? (item.orthographyRepairRepairs as Array<{ targetId: string; correct: string }>)
 .map((repair) => `${repair.targetId} | ${repair.correct}`)
 .join('\n')
 : '',
 orthographyRepairCorrectText: String(item.orthographyRepairCorrectText ?? ''),
 orderFragments: Array.isArray(item.orderFragments)
 ? (item.orderFragments as Array<{ id: string; text: string }>).map((f) => `${f.id} | ${f.text}`).join('\n')
 : '',
 orderCorrectOrder: Array.isArray(item.orderCorrectOrder) ? (item.orderCorrectOrder as string[]).join(', ') : '',
 punctuationTokens: Array.isArray(item.punctuationTokens) ? (item.punctuationTokens as string[]).join(' | ') : '',
 punctuationAllowedMarks: Array.isArray(item.punctuationAllowedMarks)
 ? (item.punctuationAllowedMarks as string[]).join(', ')
 : ',',
 punctuationMarks: Array.isArray(item.punctuationMarks)
 ? (item.punctuationMarks as Array<{ afterTokenIndex: number; mark: string }>)
 .map((mark) => `${mark.afterTokenIndex}:${mark.mark}`)
 .join(', ')
 : '',
 punctuationConstructorTokens: Array.isArray(item.punctuationConstructorTokens)
 ? (item.punctuationConstructorTokens as string[]).join(' | ')
 : '',
 punctuationConstructorMarkBank: Array.isArray(item.punctuationConstructorMarkBank)
 ? (item.punctuationConstructorMarkBank as string[]).join(', ')
 : 'comma, colon, dash',
 punctuationConstructorHints: Array.isArray(item.punctuationConstructorHints)
 ? (item.punctuationConstructorHints as string[]).join('\n')
 : '',
 punctuationConstructorGuidedSteps: Array.isArray(item.punctuationConstructorGuidedSteps)
 ? (item.punctuationConstructorGuidedSteps as Array<{
 id: string;
 title: string;
 slotIndex: number;
 marks?: string[];
 }>)
 .map((step) => `${step.id} | ${step.title} | ${step.slotIndex} | ${(step.marks ?? []).join(',')}`)
 .join('\n')
 : '',
 punctuationConstructorSegments: Array.isArray(item.punctuationConstructorSegments)
 ? (item.punctuationConstructorSegments as Array<{
 label: string;
 tokenStart: number;
 tokenEnd: number;
 kind: string;
 }>)
 .map((segment) => `${segment.label} | ${segment.tokenStart} | ${segment.tokenEnd} | ${segment.kind}`)
 .join('\n')
 : '',
 punctuationConstructorPlacements: Array.isArray(item.punctuationConstructorPlacements)
 ? (item.punctuationConstructorPlacements as Array<{ slotIndex: number; mark: string }>)
 .map((placement) => `${placement.slotIndex}:${placement.mark}`)
 .join(', ')
 : '',
 punctuationConstructorSlotExplanations: Array.isArray(item.punctuationConstructorSlotExplanations)
 ? (item.punctuationConstructorSlotExplanations as Array<{
 slotIndex: number;
 marks?: string[];
 text: string;
 }>)
 .map((item) => `${item.slotIndex} | ${(item.marks ?? []).join(',')} | ${item.text}`)
 .join('\n')
 : '',
 ege20TextWithSlots: String(item.ege20TextWithSlots ?? ''),
 ege20Slots: Array.isArray(item.ege20Slots) ? (item.ege20Slots as number[]).join(', ') : '',
 ege20TargetSet: Array.isArray(item.ege20TargetSet) ? (item.ege20TargetSet as number[]).join(', ') : '',
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
 ege21TargetSet: Array.isArray(item.ege21TargetSet) ? (item.ege21TargetSet as number[]).join(', ') : '',
 };
}

export default function AdminForm({
 initialItems,
 initialTotalItems,
 initialSelectedId = null,
 initialSelectedExercise = null,
}: AdminFormProps) {
 const router = useRouter();
 const { resolvedTheme, theme } = useTheme();
 const isClient = useSyncExternalStore(
  () => () => {},
  () => true,
  () => false,
 );
 const currentTheme = isClient ? (resolvedTheme || theme || 'light') : 'light';
 const [form, setForm] = useState<Form>(() => {
 if (initialSelectedId && initialSelectedExercise) {
 return loadFormState(initialSelectedId, formFromExerciseItem(initialSelectedExercise));
 }
 return EMPTY;
 });
 const isDraftLoaded = true;
 const [typeOptions] = useState<Form['type'][]>(
 Array.from(EXERCISE_TYPES) as Form['type'][],
 );
const [items, setItems] = useState<ListItem[]>(initialItems);
const [nextOffset, setNextOffset] = useState<number>(initialItems.length);
const [hasMore, setHasMore] = useState<boolean>(initialItems.length >= 150);
const [nextCursorId, setNextCursorId] = useState<number | null>(
 initialItems.length > 0 ? initialItems[initialItems.length - 1].id : null,
);
const [nextCursorUpdatedAt, setNextCursorUpdatedAt] = useState<string | null>(
 initialItems.length > 0 ? initialItems[initialItems.length - 1].updatedAtCursor : null,
);
const [totalItems, setTotalItems] = useState<number | null>(initialTotalItems ?? null);
 const [initialListPending, setInitialListPending] = useState(initialItems.length === 0);
 const [matchingItems, setMatchingItems] = useState<number | null>(null);
 const [loadingMore, setLoadingMore] = useState(false);
 const [selectedId, setSelectedId] = useState<number | null>(
  initialSelectedExercise ? initialSelectedId : null,
 );
 const [message, setMessage] = useState('');
 const [isError, setIsError] = useState(false);
 const [saving, setSaving] = useState(false);
 const [databaseSaveState, setDatabaseSaveState] = useState<'draft' | 'local' | 'saving' | 'saved'>(
  initialSelectedExercise ? 'saved' : 'draft',
 );
 const [databaseSavedAt, setDatabaseSavedAt] = useState<Date | null>(null);
 const [deleting, setDeleting] = useState(false);
 const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
 const [isSeedRegenerateArmed, setIsSeedRegenerateArmed] = useState(false);
 const [showSeedRegenerateModal, setShowSeedRegenerateModal] = useState(false);
 const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
 const [showFloatingSave, setShowFloatingSave] = useState(false);
 const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
 const [draftRecovery, setDraftRecovery] = useState<{
  id: number;
  serverForm: Form;
  draftForm: Form;
 } | null>(null);
 const [initialSelectionPending, setInitialSelectionPending] = useState(Boolean(initialSelectedId && !initialSelectedExercise));
const [listQuery, setListQuery] = useState('');
const [serverListQuery, setServerListQuery] = useState('');
const [listTypeFilter, setListTypeFilter] = useState<string>('all');
const [listStatusFilter, setListStatusFilter] = useState<string>('all');
const [listExamTypeFilter, setListExamTypeFilter] = useState<string>('all');
const [listSortBy, setListSortBy] = useState<'id' | 'updatedAt' | 'type' | 'status'>('id');
const [listSortDir, setListSortDir] = useState<'asc' | 'desc'>('desc');
const [sortPrefsReady, setSortPrefsReady] = useState(false);
 const [multiSelectedIds, setMultiSelectedIds] = useState<number[]>([]);
 const [lastMultiSelectedId, setLastMultiSelectedId] = useState<number | null>(null);
 const [selectionMode, setSelectionMode] = useState(false);
 const [showMoreBatchActions, setShowMoreBatchActions] = useState(false);
const [batchStatus, setBatchStatus] = useState<(typeof qualityStatuses)[number]>('review');
const [batchIsActive, setBatchIsActive] = useState<'active' | 'inactive'>('active');
const [batchSaving, setBatchSaving] = useState(false);
const [rawPreviewFilter, setRawPreviewFilter] = useState('');
const [rawPreviewLimit, setRawPreviewLimit] = useState(3);
const [rawPreviewLoading, setRawPreviewLoading] = useState(false);
const [rawPreviewItems, setRawPreviewItems] = useState<RawPreviewItem[]>([]);
const [previewCheckResult, setPreviewCheckResult] = useState<{
 isCorrect: boolean;
 text: string;
 correctAnswer?: string;
 detailedExplanation?: string;
  } | null>(null);
 const [previewDictationText, setPreviewDictationText] = useState('');
 const historyPastRef = useRef<Form[]>([]);
 const historyFutureRef = useRef<Form[]>([]);
 const suppressHistoryRef = useRef(false);
 const lastSnapshotRef = useRef('');
 const lastPersistedSnapshotRef = useRef('');
 const latestFormRef = useRef(form);
 const switchingExerciseRef = useRef(false);
 const autosaveInFlightRef = useRef(false);
 const autosaveTimerRef = useRef<number | null>(null);
const autosaveRetryTimerRef = useRef<number | null>(null);
 const deletedExerciseIdsRef = useRef<Set<number>>(new Set());
const initializedFromUrlRef = useRef(Boolean(initialSelectedId));
const initialTargetIdRef = useRef<number | null>(initialSelectedId);
const initialSelectionResolvedRef = useRef(false);
const sortPrefsReadyRef = useRef(false);
const sidebarRef = useRef<HTMLElement | null>(null);
 const formRef = useRef<HTMLFormElement | null>(null);
 const mainSaveAnchorRef = useRef<HTMLDivElement | null>(null);
const [activeMarks] = useState<ActiveMarks>(EMPTY_ACTIVE_MARKS);
const lastAppliedRefreshKeyRef = useRef('');
const inFlightRefreshKeyRef = useRef<string | null>(null);
const refreshSeqRef = useRef(0);
const refreshAbortControllerRef = useRef<AbortController | null>(null);
const sessionDraftIdsRef = useRef<Set<number>>(new Set());
const loadExerciseSeqRef = useRef(0);

const markdownCommands = useMemo<ICommand[]>(() => ([
 makeToggleCommand('bold', 'bold', <span style={{ fontSize: 14, fontWeight: 800 }}>B</span>, 'Жирный', { kind: 'markdown', prefix: '**' }, false),
 makeToggleCommand('italic', 'italic', <span style={{ fontSize: 14, fontStyle: 'italic' }}>I</span>, 'Курсив', { kind: 'markdown', prefix: '*' }, false),
 makeToggleCommand('strikethrough', 'strikethrough', <span style={{ fontSize: 14, textDecoration: 'line-through' }}>S</span>, 'Зачёркнутый', { kind: 'markdown', prefix: '~~' }, false),
 makeToggleCommand('underline', 'underline', <span style={{ fontSize: 14, textDecoration: 'underline' }}>U</span>, 'Подчёркнутый', { kind: 'html', openTag: '<u>', closeTag: '</u>' }, false),
 makeToggleCommand('doubleUnderline', 'doubleUnderline', <span style={{ fontSize: 14, textDecoration: 'underline double' }}>U</span>, 'Двойное подчёркивание', { kind: 'html', openTag: '<ins class="du">', closeTag: '</ins>' }, false),
 commands.hr,
 commands.divider,
 commands.link,
 commands.quote,
 commands.code,
 commands.image,
 commands.divider,
 commands.unorderedListCommand,
 commands.orderedListCommand,
 commands.checkedListCommand,
]), []);

 function clearPendingDraftMarker(id: number) {
 const pendingValue = document.cookie
 .split('; ')
 .find((entry) => entry.startsWith('admin_pending_draft_id='))
 ?.split('=')[1];
 if (pendingValue === String(id)) {
 document.cookie = 'admin_pending_draft_id=; Path=/admin; Max-Age=0; SameSite=Lax';
 }
 }

 function offerExistingDraftRecovery(id: number, serverForm: Form) {
 const storedDraft = readStoredDraft(id);
 if (!storedDraft) {
 logDraftRecoveryDebug('offerExistingDraftRecovery:noDraft', { id, serverType: serverForm.type });
 return;
 }
 const { form: localDraft, sessionId } = storedDraft;
 if (JSON.stringify(localDraft) === JSON.stringify(serverForm)) {
 localStorage.removeItem(getDraftKey(id));
 clearPendingDraftMarker(id);
 sessionDraftIdsRef.current.delete(id);
 logDraftRecoveryDebug('offerExistingDraftRecovery:draftMatchesServer', { id, sessionId });
 return;
 }
 const currentSessionId = getDraftSessionId();
 if (sessionId && sessionId === currentSessionId) {
 sessionDraftIdsRef.current.add(id);
 setForm(localDraft);
 setSelectedId(id);
 setDatabaseSaveState('local');
 setDraftRecovery(null);
 logDraftRecoveryDebug('offerExistingDraftRecovery:autoRestoreSameSession', {
 id,
 draftSessionId: sessionId,
 currentSessionId,
 serverType: serverForm.type,
 draftType: localDraft.type,
 });
 return;
 }
 if (sessionDraftIdsRef.current.has(id)) {
 setForm(localDraft);
 setSelectedId(id);
 setDatabaseSaveState('local');
 setDraftRecovery(null);
 logDraftRecoveryDebug('offerExistingDraftRecovery:autoRestoreSessionRef', {
 id,
 draftSessionId: sessionId,
 currentSessionId,
 serverType: serverForm.type,
 draftType: localDraft.type,
 });
 return;
 }
 logDraftRecoveryDebug('offerExistingDraftRecovery:showModal', {
 id,
 draftSessionId: sessionId,
 currentSessionId,
 serverType: serverForm.type,
 draftType: localDraft.type,
 });
 setDraftRecovery({ id, serverForm, draftForm: localDraft });
 }

useEffect(() => {
 const timer = window.setTimeout(() => {
  try {
   const savedSortBy = localStorage.getItem('admin_list_sort_by');
   const savedSortDir = localStorage.getItem('admin_list_sort_dir');
   if (savedSortBy === 'id' || savedSortBy === 'updatedAt' || savedSortBy === 'type' || savedSortBy === 'status') {
    setListSortBy(savedSortBy);
   }
   if (savedSortDir === 'asc' || savedSortDir === 'desc') {
    setListSortDir(savedSortDir);
   }
  } catch {}
  sortPrefsReadyRef.current = true;
  setSortPrefsReady(true);
 }, 0);
 return () => window.clearTimeout(timer);
}, []);

useEffect(() => {
 if (!sortPrefsReadyRef.current) return;
 try {
 localStorage.setItem('admin_list_sort_by', listSortBy);
 localStorage.setItem('admin_list_sort_dir', listSortDir);
 } catch {}
}, [listSortBy, listSortDir]);

 useEffect(() => {
  if (initialSelectionResolvedRef.current) return;
  const searchId = getExerciseIdFromSearch(window.location.search);
  const hashId = getExerciseIdFromHash(window.location.hash);

  if (initialSelectedId && initialSelectedExercise) {
  initialSelectionResolvedRef.current = true;
  window.setTimeout(() => {
   offerExistingDraftRecovery(
    initialSelectedId,
   loadFormState(initialSelectedId, formFromExerciseItem(initialSelectedExercise)),
  );
 }, 0);
 return;
 }

  if (!initialSelectedId) {
  const id = searchId ?? hashId;
  const hasTargetId = id !== null;
  initialTargetIdRef.current = hasTargetId ? id : null;
  initializedFromUrlRef.current = hasTargetId;
  if (hasTargetId) {
  initialSelectionResolvedRef.current = true;
  window.setTimeout(() => setInitialSelectionPending(true), 0);
  }
  }

  if (!initializedFromUrlRef.current && !initialSelectedExercise) {
  initialSelectionResolvedRef.current = true;
  setForm(loadFormState(null, EMPTY));
  setInitialSelectionPending(false);
  }
 // This initialization reads local recovery once for the server-selected exercise.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [initialSelectedId, initialSelectedExercise]);

 useEffect(() => {
 if (!isDraftLoaded) return;
 if (lastPersistedSnapshotRef.current) return;
 lastPersistedSnapshotRef.current = JSON.stringify(form);
 }, [form, isDraftLoaded]);

 useEffect(() => {
 latestFormRef.current = form;
 if (!isDraftLoaded) return;
 const snapshot = JSON.stringify(form);
 if (snapshot === lastPersistedSnapshotRef.current) return;
 writeStoredDraft(form.id, form);
 if (form.id) {
 sessionDraftIdsRef.current.add(form.id);
 }
 setDatabaseSaveState('local');
 if (form.id) {
 document.cookie = `admin_pending_draft_id=${form.id}; Path=/admin; Max-Age=31536000; SameSite=Lax`;
 }
 }, [form, isDraftLoaded]);

 useEffect(() => {
 if (!isDraftLoaded) return;
 const snapshot = JSON.stringify(form);
 if (!lastSnapshotRef.current) {
 lastSnapshotRef.current = snapshot;
 historyPastRef.current = [JSON.parse(snapshot) as Form];
 historyFutureRef.current = [];
 return;
 }
 if (suppressHistoryRef.current) {
 suppressHistoryRef.current = false;
 lastSnapshotRef.current = snapshot;
 return;
 }
 if (snapshot === lastSnapshotRef.current) return;
 historyPastRef.current.push(JSON.parse(snapshot) as Form);
 if (historyPastRef.current.length > 120) {
 historyPastRef.current.shift();
 }
 historyFutureRef.current = [];
 lastSnapshotRef.current = snapshot;
 }, [form, isDraftLoaded]);

 function clearExerciseUrlSelection() {
 const url = new URL(window.location.href);
 const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
 hashParams.delete('exercise');
 url.searchParams.delete('exercise');
 url.searchParams.delete('id');
 url.searchParams.delete('exerciseId');
 url.hash = hashParams.toString();
 router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
 }

 function storeLocalDraft(source: Form) {
 writeStoredDraft(source.id, source);
 if (source.id) {
 sessionDraftIdsRef.current.add(source.id);
 document.cookie = `admin_pending_draft_id=${source.id}; Path=/admin; Max-Age=31536000; SameSite=Lax`;
 }
 }

 function markDatabaseSaveSucceeded(source: Form, snapshot: string) {
  lastPersistedSnapshotRef.current = snapshot;
  setDatabaseSavedAt(new Date());
  if (JSON.stringify(latestFormRef.current) !== snapshot) {
   storeLocalDraft(latestFormRef.current);
   setDatabaseSaveState('local');
   return;
  }
  localStorage.removeItem(getDraftKey(source.id));
  if (source.id) {
  clearPendingDraftMarker(source.id);
  sessionDraftIdsRef.current.delete(source.id);
  }
  setDatabaseSaveState('saved');
 }

 function useRecoveredDraft() {
 if (!draftRecovery) return;
 logDraftRecoveryDebug('useRecoveredDraft', {
 id: draftRecovery.id,
 draftType: draftRecovery.draftForm.type,
 serverType: draftRecovery.serverForm.type,
 });
 lastPersistedSnapshotRef.current = JSON.stringify(draftRecovery.serverForm);
 setForm(draftRecovery.draftForm);
 setSelectedId(draftRecovery.id);
 setDatabaseSaveState('local');
 setDraftRecovery(null);
 setIsError(false);
 setMessage('Локальные изменения восстановлены. Автосохранение включено.');
 }

 function useDatabaseVersion() {
 if (!draftRecovery) return;
 logDraftRecoveryDebug('useDatabaseVersion', {
 id: draftRecovery.id,
 draftType: draftRecovery.draftForm.type,
 serverType: draftRecovery.serverForm.type,
 });
 localStorage.removeItem(getDraftKey(draftRecovery.id));
 clearPendingDraftMarker(draftRecovery.id);
 sessionDraftIdsRef.current.delete(draftRecovery.id);
 setForm(draftRecovery.serverForm);
 lastPersistedSnapshotRef.current = JSON.stringify(draftRecovery.serverForm);
 setSelectedId(draftRecovery.id);
 setDatabaseSaveState('saved');
 setDatabaseSavedAt(null);
 setDraftRecovery(null);
 setIsError(false);
 setMessage('Используется актуальная версия из базы.');
 }

 useEffect(() => {
 if (!form.id) return;
 const url = new URL(window.location.href);
  url.searchParams.set('exercise', String(form.id));
  url.searchParams.delete('id');
  url.searchParams.delete('exerciseId');
 const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
 hashParams.delete('exercise');
 url.hash = hashParams.toString();
 const nextUrl = `${url.pathname}${url.search}${url.hash}`;
 const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
 if (nextUrl !== currentUrl) {
 router.replace(nextUrl, { scroll: false });
 }
 }, [form.id, router]);

 useEffect(() => {
 const baseTitle = 'Админка ЕГЭ';
 if (!form.id) {
 document.title = baseTitle;
 return;
 }
 const slug = slugFromPrompt(form.prompt);
 document.title = `${baseTitle} · #${form.id} · ${slug}`;
 }, [form.id, form.prompt]);

 useEffect(() => {
 if (message) {
 const timer = setTimeout(() => setMessage(''), 3000);
 return () => clearTimeout(timer);
 }
 }, [message]);

 useEffect(() => {
 // eslint-disable-next-line react-hooks/set-state-in-effect
 setPreviewCheckResult(null);
 // eslint-disable-next-line react-hooks/set-state-in-effect
 setPreviewDictationText('');
 }, [form]);

 const isEdit = typeof form.id === 'number';
 const parsedSkillTags = useMemo(
 () => form.skillTags.split(',').map((v) => v.trim()).filter(Boolean),
 [form.skillTags],
 );
 const isEge18FillBlank =
 form.type === 'fill_blank' && parsedSkillTags.includes('ege.18');
 const ege18AcceptedSignature = useMemo(
 () => normalizeNumberAnswerSignature(form.fillAccepted),
 [form.fillAccepted],
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

function updateActiveMarksFromTarget(_target: EventTarget | null) {}

 useEffect(() => {
 const anchor = mainSaveAnchorRef.current;
 if (!anchor || typeof IntersectionObserver === 'undefined') return;

 const observer = new IntersectionObserver(
 ([entry]) => {
 setShowFloatingSave(!entry.isIntersecting);
 },
 {
 root: null,
 threshold: 0.05,
 },
 );
 observer.observe(anchor);
 return () => observer.disconnect();
 }, []);

 function examTypeOf(item: ListItem) {
 for (const tag of item.skillTags ?? []) {
 const m = tag.match(/^ege\.(\d{1,2})$/);
 if (m) return m[1];
 }
 return 'n/a';
 }

 const filteredItems = useMemo(() => {
 const q = normalizeSearchText(listQuery);
 const filtered = items.filter((item) => {
 if (listTypeFilter !== 'all' && item.type !== listTypeFilter) return false;
 if (listStatusFilter !== 'all' && item.qualityStatus !== listStatusFilter) return false;
 if (listExamTypeFilter !== 'all' && examTypeOf(item) !== listExamTypeFilter) return false;
 if (!q) return true;
 const seedNorm = normalizeSearchText(item.seedKey ?? '');
 const promptNorm = normalizeSearchText(item.prompt);
 const explanationNorm = normalizeSearchText(item.explanation ?? '');
 const searchTextNorm = normalizeSearchText(item.searchText ?? '');
 return (
 String(item.id).includes(q) ||
 seedNorm.includes(q) ||
 promptNorm.includes(q) ||
 explanationNorm.includes(q) ||
 searchTextNorm.includes(q)
 );
 });
 return [...filtered].sort((a, b) => {
 let cmp = 0;
 if (listSortBy === 'id') cmp = a.id - b.id;
 else if (listSortBy === 'updatedAt') cmp = new Date(a.updatedAtCursor).getTime() - new Date(b.updatedAtCursor).getTime();
 else if (listSortBy === 'type') cmp = a.type.localeCompare(b.type);
 else cmp = a.qualityStatus.localeCompare(b.qualityStatus);
 return listSortDir === 'asc' ? cmp : -cmp;
 });
 }, [items, listQuery, listTypeFilter, listStatusFilter, listExamTypeFilter, listSortBy, listSortDir]);
 const groupedItems = useMemo(() => {
 const groups = new Map<string, ListItem[]>();
 for (const item of filteredItems) {
 const key = `ЕГЭ ${examTypeOf(item)} · ${item.type}`;
 if (!groups.has(key)) groups.set(key, []);
 groups.get(key)!.push(item);
 }
 return [...groups.entries()];
 }, [filteredItems]);
 const flatFilteredItems = filteredItems;
 const multiSelectedSet = useMemo(() => new Set(multiSelectedIds), [multiSelectedIds]);

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
 const accepted = isEge18FillBlank
 ? [ege18AcceptedSignature].filter(Boolean)
 : form.fillAccepted
 .split(',')
 .map((v) => v.trim())
 .filter(Boolean);

 candidate = {
 ...base,
 payload: {
 before:
 isEge18FillBlank
 ? stripEge18PromptFromFillBefore(form.fillBefore, form.prompt) || 'Текст до пропуска'
 : form.fillBefore || 'Текст до пропуска',
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
 } else if (form.type === 'dictation') {
 const playbackRates = form.dictationPlaybackRates
 .split(',')
 .map((value) => Number(value.trim()))
 .filter((value) => Number.isFinite(value) && value > 0);

 candidate = {
 ...base,
 payload: {
 title: form.dictationTitle.trim() || form.prompt.trim() || 'Диктант',
 audioSrc:
 form.dictationAudioSrc.trim() ||
 '/voice_memos/audio_2026-06-08_00-53-43.ogg',
 ...(playbackRates.length > 0 ? { playbackRates } : {}),
 },
 answer: {
 text: form.dictationText.trim() || 'Текст диктанта.',
 caseSensitive: form.dictationCaseSensitive,
 ignorePunctuation: form.dictationIgnorePunctuation,
 },
 };
 } else if (form.type === 'orthography_repair') {
 const targets = parseOrthographyRepairTargets(form.orthographyRepairTargets);
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
 const repairs = parseOrthographyRepairRepairs(form.orthographyRepairRepairs)
 .filter((repair) => targetIds.has(repair.targetId));
 const safeRepairs =
 repairs.length > 0
 ? repairs
 : safeTargets.map((target) => ({
 targetId: target.id,
 correct: target.replacement,
 }));

 candidate = {
 ...base,
 payload: {
 text:
 form.orthographyRepairText.trim() ||
 `Найдите слово: ${safeTargets[0]?.surface ?? 'ошыбка'}.`,
 mode: form.orthographyRepairMode,
 targets: safeTargets,
 ...(form.orthographyRepairHints.trim()
 ? {
 hints: form.orthographyRepairHints
 .split('\n')
 .map((value) => value.trim())
 .filter(Boolean),
 }
 : {}),
 },
 answer: {
 repairs: safeRepairs,
 ...(form.orthographyRepairCorrectText.trim()
 ? { correctText: form.orthographyRepairCorrectText.trim() }
 : {}),
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
 } else if (form.type === 'punctuation_constructor') {
 const tokens = form.punctuationConstructorTokens
 .split('|')
 .map((value) => value.trim())
 .filter(Boolean);
 const markBank = parsePunctuationConstructorMarkBank(
 form.punctuationConstructorMarkBank,
 );

 candidate = {
 ...base,
 payload: {
 tokens:
 tokens.length >= 2
 ? tokens
 : ['Мне', 'сказали', 'Ждите', 'придет'],
 markBank:
 markBank.length > 0
 ? markBank
 : (['comma', 'colon', 'dash'] satisfies PCMark[]),
 ...(form.punctuationConstructorHints.trim()
 ? {
 hints: form.punctuationConstructorHints
 .split('\n')
 .map((value) => value.trim())
 .filter(Boolean),
 }
 : {}),
 ...(form.punctuationConstructorGuidedSteps.trim()
 ? {
 guidedSteps: parsePunctuationConstructorGuidedSteps(
 form.punctuationConstructorGuidedSteps,
 ),
 }
 : {}),
 ...(form.punctuationConstructorSegments.trim()
 ? { segments: parsePunctuationConstructorSegments(form.punctuationConstructorSegments) }
 : {}),
 },
 answer: {
 placements: parsePunctuationConstructorPlacements(
 form.punctuationConstructorPlacements,
 ),
 ...(form.punctuationConstructorSlotExplanations.trim()
 ? {
 slotExplanations: parsePunctuationConstructorSlotExplanations(
 form.punctuationConstructorSlotExplanations,
 ),
 }
 : {}),
 },
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
 if (
 exerciseType === 'ege_multi_select' ||
 exerciseType === 'punctuation_constructor' ||
 exerciseType === 'orthography_repair'
 ) {
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
 if (preview.exercise.type === 'dictation') {
 setPreviewCheckResult({
 isCorrect: result.isCorrect,
 text: buildDictationFeedbackText(result.normalizedAnswer),
 });
 return;
 }
 const previewFeedback =
 preview.exercise.type === 'ege_multi_select'
 ? preview.exercise.payload.feedback
 : undefined;
 const computedCorrectAnswer = result.feedback.correctAnswer?.trim();
 const fallbackCorrectAnswer = previewFeedback?.correctAnswer.join('\n\n');
 const usesInlineFeedback =
 preview.exercise.type === 'punctuation_constructor' ||
 preview.exercise.type === 'orthography_repair';
 const prefix =
 usesInlineFeedback && !result.isCorrect
 ? ''
 : answerFeedbackPrefix(result.isCorrect);
 const prefixText = prefix ? `${prefix}\n\n` : '';
 setPreviewCheckResult({
 isCorrect: result.isCorrect,
 text: `${prefixText}${result.feedback.explanation}${buildStepFeedbackText(
 result,
 preview.exercise.type,
 )}`,
 correctAnswer:
 computedCorrectAnswer || fallbackCorrectAnswer,
 detailedExplanation:
 previewFeedback?.explanation.join('\n') ?? result.feedback.detailedExplanation,
 });
}

 function handlePreviewDictationSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const text = previewDictationText.trim();
  if (!text) return;
  handlePreviewSubmit({ type: 'dictation', text });
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

 const hasActiveListFilter =
  serverListQuery.trim().length > 0 ||
  listTypeFilter !== 'all' ||
  listStatusFilter !== 'all' ||
  listExamTypeFilter !== 'all';

 async function refreshList(options?: { includeTotal?: boolean; force?: boolean }) {
 const hasSearchQuery = serverListQuery.trim().length > 0;
 const includeTotal = options?.includeTotal ?? ((hasActiveListFilter && !hasSearchQuery) || initialListPending);
 const requestKey = JSON.stringify({
 query: serverListQuery,
 type: listTypeFilter,
 qualityStatus: listStatusFilter,
 examType: listExamTypeFilter,
 sortBy: listSortBy === 'updatedAt' ? 'updatedAt' : 'id',
 sortDir: listSortDir,
 includeTotal,
 });
 if (!options?.force) {
 if (requestKey === lastAppliedRefreshKeyRef.current) return;
 if (requestKey === inFlightRefreshKeyRef.current) return;
 }
 refreshAbortControllerRef.current?.abort();
 const abortController = new AbortController();
 refreshAbortControllerRef.current = abortController;
 inFlightRefreshKeyRef.current = requestKey;
 const requestSeq = ++refreshSeqRef.current;
 let res: ExerciseListResponse;
 try {
 res = await fetchExerciseList({
 limit: 150,
 offset: 0,
 sortBy: listSortBy === 'updatedAt' ? 'updatedAt' : 'id',
 sortDir: listSortDir,
 includeTotal,
 query: serverListQuery,
 type: listTypeFilter,
 qualityStatus: listStatusFilter,
 examType: listExamTypeFilter,
 signal: abortController.signal,
 });
 } catch (error) {
 if (error instanceof DOMException && error.name === 'AbortError') {
 if (inFlightRefreshKeyRef.current === requestKey) {
 inFlightRefreshKeyRef.current = null;
 }
 return;
 }
 throw error;
 }
 if (requestSeq !== refreshSeqRef.current) return;
 if (res.success) {
 setItems(res.items as ListItem[]);
 setNextOffset(res.nextOffset ?? (res.items?.length ?? 0));
 setHasMore(Boolean(res.hasMore));
 const cursorId = typeof res.nextCursorId === 'number' ? res.nextCursorId : null;
 const cursorUpdatedAt = typeof res.nextCursorUpdatedAt === 'string' ? res.nextCursorUpdatedAt : null;
 setNextCursorId(cursorId);
 setNextCursorUpdatedAt(cursorUpdatedAt);
  if (includeTotal) {
  const resultCount = Number(res.total ?? res.items.length);
  if (hasActiveListFilter) {
  setMatchingItems(resultCount);
  } else {
  setTotalItems(resultCount);
  setMatchingItems(null);
  }
  } else {
  setMatchingItems(null);
 }
 lastAppliedRefreshKeyRef.current = requestKey;
 } else {
 deletedExerciseIdsRef.current.delete(deletedId);
 setIsError(true);
 setMessage(res.error || 'Ошибка загрузки списка заданий.');
 }
 if (initialListPending) {
 setInitialListPending(false);
 }
 if (inFlightRefreshKeyRef.current === requestKey) {
 inFlightRefreshKeyRef.current = null;
 }
 if (refreshAbortControllerRef.current === abortController) {
 refreshAbortControllerRef.current = null;
 }
 }

 async function loadMore() {
 if (!hasMore || loadingMore) return;
 setLoadingMore(true);
 try {
 const res = await fetchExerciseList({
 limit: 150,
 offset: nextOffset,
 cursorId: nextCursorId,
 cursorUpdatedAt: nextCursorUpdatedAt,
 sortBy: listSortBy === 'updatedAt' ? 'updatedAt' : 'id',
 sortDir: listSortDir,
 includeTotal: false,
 query: serverListQuery,
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
 const cursorId = typeof res.nextCursorId === 'number' ? res.nextCursorId : null;
 const cursorUpdatedAt = typeof res.nextCursorUpdatedAt === 'string' ? res.nextCursorUpdatedAt : null;
 setNextCursorId(cursorId);
 setNextCursorUpdatedAt(cursorUpdatedAt);
 } else {
 deletedExerciseIdsRef.current.delete(deletedId);
 setIsError(true);
 setMessage(res.error || 'Ошибка подгрузки списка.');
 }
 } finally {
 setLoadingMore(false);
 }
 }

useEffect(() => {
 const timer = setTimeout(() => {
 setServerListQuery(listQuery);
 }, 500);
 return () => clearTimeout(timer);
}, [listQuery]);

useEffect(() => () => {
 refreshAbortControllerRef.current?.abort();
}, []);

useEffect(() => {
 if (!sortPrefsReady) return;
 const timer = setTimeout(() => {
 void refreshList();
 }, 0);
 return () => clearTimeout(timer);
 // eslint-disable-next-line react-hooks/exhaustive-deps
}, [sortPrefsReady, serverListQuery, listTypeFilter, listStatusFilter, listExamTypeFilter, listSortBy, listSortDir]);

 useEffect(() => {
 if (!isSeedRegenerateArmed) return;
 const timer = setTimeout(() => setIsSeedRegenerateArmed(false), 5000);
 return () => clearTimeout(timer);
 }, [isSeedRegenerateArmed]);

useEffect(() => {
 if (selectedId) {
 localStorage.setItem('admin_last_selected_id', String(selectedId));
 document.cookie = `admin_selected_exercise_id=${selectedId}; Path=/admin; Max-Age=31536000; SameSite=Lax`;
 return;
 }
 localStorage.removeItem('admin_last_selected_id');
 document.cookie = 'admin_selected_exercise_id=; Path=/admin; Max-Age=0; SameSite=Lax';
 }, [selectedId]);

 useEffect(() => {
 if (!isDraftLoaded) return;
 setHasUnsavedChanges(JSON.stringify(form) !== lastPersistedSnapshotRef.current);
 }, [form, isDraftLoaded]);

async function loadExercise(id: number) {
 const requestSeq = ++loadExerciseSeqRef.current;
 logDraftRecoveryDebug('loadExercise:start', {
 id,
 requestSeq,
 currentSelectedId: selectedId,
 currentFormId: form.id ?? null,
 currentFormType: form.type,
 });
 const res = await fetchExerciseById(id);
 if (requestSeq !== loadExerciseSeqRef.current) {
  logDraftRecoveryDebug('loadExercise:staleResultIgnored', { id, requestSeq });
  return;
 }
 if (!res.success || !res.item) {
 logDraftRecoveryDebug('loadExercise:error', {
 id,
 error: res.error || 'Не удалось открыть задание.',
 });
 setIsError(true);
 setMessage(res.error || 'Не удалось открыть задание.');
 return;
 }
 const item = res.item as Record<string, unknown>;
 const nextForm = formFromExerciseItem(item);
 const loaded = loadFormState(id, nextForm);
 setForm(loaded);
 lastPersistedSnapshotRef.current = JSON.stringify(loaded);
 setSelectedId(id);
 setDatabaseSaveState('saved');
 setDatabaseSavedAt(null);
 logDraftRecoveryDebug('loadExercise:loaded', {
 id,
 requestSeq,
 loadedType: loaded.type,
 });
 offerExistingDraftRecovery(id, loaded);
 setMessage('');
 setIsSeedRegenerateArmed(false);
 setShowSeedRegenerateModal(false);
 }

 function toggleMultiSelectionByClick(itemId: number, event: React.MouseEvent<HTMLButtonElement>) {
 const isShift = event.shiftKey;
 const isToggle = event.ctrlKey || event.metaKey;
 if (!selectionMode && !isShift && !isToggle) {
 void openExerciseWithAutosave(itemId);
 setLastMultiSelectedId(itemId);
 return;
 }

 event.preventDefault();
 event.stopPropagation();

 const anchorId = lastMultiSelectedId ?? selectedId;
 if (isShift && anchorId != null) {
 const ids = flatFilteredItems.map((i) => i.id);
 const from = ids.indexOf(anchorId);
 const to = ids.indexOf(itemId);
 if (from >= 0 && to >= 0) {
 const [start, end] = from <= to ? [from, to] : [to, from];
 const range = ids.slice(start, end + 1);
 setMultiSelectedIds((prev) => {
 const prevSet = new Set(prev);
 const allSelected = range.every((id) => prevSet.has(id));
 if (allSelected) {
 return prev.filter((id) => !range.includes(id));
 }
 return Array.from(new Set([...prev, ...range]));
 });
 setLastMultiSelectedId(anchorId);
 setSelectionMode(true);
 return;
 }
 }

 setMultiSelectedIds((prev) => {
 const next = prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId];
 if (next.length === 0) {
 setSelectionMode(false);
 setShowMoreBatchActions(false);
 }
 return next;
 });
 setLastMultiSelectedId(itemId);
 setSelectionMode(true);
 }

 function clearMultiSelection() {
 setMultiSelectedIds([]);
 setLastMultiSelectedId(null);
 setSelectionMode(false);
 setShowMoreBatchActions(false);
 }

 function selectAllShownItems() {
  const visibleIds = flatFilteredItems.map((item) => item.id);
  setMultiSelectedIds(visibleIds);
  setLastMultiSelectedId(visibleIds[visibleIds.length - 1] ?? null);
  setSelectionMode(true);
 }

 async function applyBatchStatus() {
 if (multiSelectedIds.length === 0 || batchSaving) return;
 setBatchSaving(true);
 const res = await batchUpdateExercisesMetaAction({
 ids: multiSelectedIds,
 qualityStatus: batchStatus,
 });
 if (res.success) {
 setMessage(`Обновлено заданий: ${multiSelectedIds.length}.`);
 setIsError(false);
 clearMultiSelection();
 await refreshList({ includeTotal: true, force: true });
 } else {
 setIsError(true);
 setMessage(res.error || 'Ошибка массового обновления.');
 }
 setBatchSaving(false);
 }

 async function runRawPreviewAudit() {
 if (rawPreviewLoading) return;
 setRawPreviewLoading(true);
 setIsError(false);
 setMessage('');
 const res = await previewRawNormalizationAction({
 fileFilter: rawPreviewFilter,
 limit: rawPreviewLimit,
 });
 if (res.success) {
 setRawPreviewItems((res.items as RawPreviewItem[]) ?? []);
 } else {
 setIsError(true);
 setMessage(res.error || 'Не удалось просканировать raw HTML.');
 }
 setRawPreviewLoading(false);
 }

 async function applyBatchActivity() {
 if (multiSelectedIds.length === 0 || batchSaving) return;
 setBatchSaving(true);
 const res = await batchUpdateExercisesMetaAction({
 ids: multiSelectedIds,
 isActive: batchIsActive === 'active',
 });
 if (res.success) {
 setMessage(`Обновлено заданий: ${multiSelectedIds.length}.`);
 setIsError(false);
 clearMultiSelection();
 await refreshList({ force: true });
 } else {
 setIsError(true);
 setMessage(res.error || 'Ошибка массового обновления.');
 }
 setBatchSaving(false);
 }

 useEffect(() => {
 if (!selectionMode) return;
 const onEsc = (e: KeyboardEvent) => {
 if (e.key === 'Escape') clearMultiSelection();
 };
 window.addEventListener('keydown', onEsc);
 return () => window.removeEventListener('keydown', onEsc);
 }, [selectionMode]);

 useEffect(() => {
 const onPointerDown = (e: MouseEvent) => {
 const active = document.activeElement;
 if (!(active instanceof HTMLButtonElement)) return;
 if (!sidebarRef.current?.contains(active)) return;
 const target = e.target as Node | null;
 if (target && sidebarRef.current.contains(target)) return;
 active.blur();
 };
 document.addEventListener('pointerdown', onPointerDown);
 return () => document.removeEventListener('pointerdown', onPointerDown);
 }, []);

 useEffect(() => {
 if (!isDraftLoaded || !initialSelectionPending) return;
 const id = initialTargetIdRef.current;
 if (id == null) {
 setInitialSelectionPending(false);
 return;
 }
 void (async () => {
 try {
 await loadExercise(id);
 } finally {
 setInitialSelectionPending(false);
 }
 })();
 // Load only when a queued initial target changes; depending on loadExercise would refetch on renders.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [isDraftLoaded, initialSelectionPending]);

 function parsePunctuationMarks(raw: string) {
  const regex = /(\d+)\s*:\s*([^\s]+)/g;
  const matches = Array.from(raw.matchAll(regex));

  return matches
    .map((m) => {
      const idx = m[1];
      let mark = m[2];
      if (mark.length > 1 && mark.endsWith(',')) {
        mark = mark.slice(0, -1);
      }
      return {
        afterTokenIndex: Number(idx),
        mark: mark as PMark,
      };
    })
    .filter(
      (v) =>
        Number.isInteger(v.afterTokenIndex) &&
        v.afterTokenIndex >= 0 &&
        typeof v.mark === 'string' &&
        v.mark.length > 0,
    );
}

function parseOrthographyRepairTargets(raw: string) {
 return raw
 .split('\n')
 .map((line) => line.trim())
 .filter(Boolean)
 .map((line, index) => {
 const parts = line.split('|').map((part) => part.trim());
 const [idRaw, surfaceRaw, replacementRaw, typeRaw, optionsRaw, occurrenceRaw] = parts;
 return {
 id: idRaw || `target_${index + 1}`,
 surface: surfaceRaw ?? '',
 replacement: replacementRaw ?? '',
 type: typeRaw === 'span' ? 'span' as const : 'word' as const,
 options: optionsRaw
 ? optionsRaw
 .split(',')
 .map((option) => option.trim())
 .filter(Boolean)
 : undefined,
 occurrence: occurrenceRaw ? Number(occurrenceRaw) : undefined,
 };
 })
 .filter(
 (target) =>
 target.id.length > 0 &&
 target.surface.length > 0 &&
 target.replacement.length > 0,
 );
}

function parseOrthographyRepairRepairs(raw: string) {
 return raw
 .split('\n')
 .map((line) => line.trim())
 .filter(Boolean)
 .map((line) => {
 const [targetIdRaw, correctRaw] = line.split('|').map((part) => part.trim());
 return {
 targetId: targetIdRaw ?? '',
 correct: correctRaw ?? '',
 };
 })
 .filter((repair) => repair.targetId.length > 0 && repair.correct.length > 0);
}

 function parsePunctuationConstructorMarkBank(raw: string): PCMark[] {
  const allowed = new Set<PCMark>([
    'comma',
    'colon',
    'semicolon',
    'dash',
    'quote_open',
    'quote_close',
    'paren_open',
    'paren_close',
    'period',
    'exclamation',
    'question',
    'ellipsis',
  ]);

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is PCMark => allowed.has(value as PCMark));
}

 function parsePunctuationConstructorPlacements(raw: string) {
  const markBank = new Set<PCMark>([
    'comma',
    'colon',
    'semicolon',
    'dash',
    'quote_open',
    'quote_close',
    'paren_open',
    'paren_close',
    'period',
    'exclamation',
    'question',
    'ellipsis',
  ]);
  const regex = /(\d+)\s*:\s*([a-z_]+)/g;
  const matches = Array.from(raw.matchAll(regex));

  return matches
    .map((match) => ({
      slotIndex: Number(match[1]),
      mark: match[2] as PCMark,
    }))
    .filter(
      (placement) =>
        Number.isInteger(placement.slotIndex) &&
        placement.slotIndex >= 0 &&
      markBank.has(placement.mark),
    );
}

 function punctuationConstructorGlyph(mark: PCMark) {
  const glyphs: Record<PCMark, string> = {
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
  };

  return glyphs[mark];
}

 function renderPunctuationConstructorAnswer(
  tokensRaw: string,
  placementsRaw: string,
) {
  const tokens = tokensRaw
    .split('|')
    .map((token) => token.trim())
    .filter(Boolean);
  const placements = parsePunctuationConstructorPlacements(placementsRaw);
  const parts: string[] = [];

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const beforeMarks = placements
      .filter((placement) => placement.slotIndex === tokenIndex)
      .map((placement) => punctuationConstructorGlyph(placement.mark))
      .join('');
    if (beforeMarks) parts.push(beforeMarks);
    parts.push(tokens[tokenIndex]);
  }

  const tailMarks = placements
    .filter((placement) => placement.slotIndex === tokens.length)
    .map((placement) => punctuationConstructorGlyph(placement.mark))
    .join('');
  if (tailMarks) parts.push(tailMarks);

  return parts
    .join(' ')
    .replace(/\s+([,;:.!?»)\u2026])/g, '$1')
    .replace(/([:;])«/g, '$1 «')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

 function parsePunctuationConstructorSegments(raw: string) {
  const allowed = new Set([
    'author_words',
    'direct_speech',
    'main_clause',
    'subordinate_clause',
    'introductory',
    'enumeration',
    'other',
  ]);

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, tokenStart, tokenEnd, kind] = line
        .split('|')
        .map((part) => part.trim());
      return {
        label,
        tokenStart: Number(tokenStart),
        tokenEnd: Number(tokenEnd),
        kind,
      };
    })
    .filter(
      (segment) =>
        segment.label &&
        Number.isInteger(segment.tokenStart) &&
        segment.tokenStart >= 0 &&
        Number.isInteger(segment.tokenEnd) &&
        segment.tokenEnd >= segment.tokenStart &&
        allowed.has(segment.kind),
    )
    .map((segment) => ({
      ...segment,
      kind: segment.kind as
        | 'author_words'
        | 'direct_speech'
        | 'main_clause'
        | 'subordinate_clause'
        | 'introductory'
        | 'enumeration'
        | 'other',
    }));
}

 function parsePunctuationConstructorGuidedSteps(raw: string) {
  const markBank = new Set<PCMark>([
    'comma',
    'colon',
    'semicolon',
    'dash',
    'quote_open',
    'quote_close',
    'paren_open',
    'paren_close',
    'period',
    'exclamation',
    'question',
    'ellipsis',
  ]);

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [idRaw, titleRaw, slotRaw, marksRaw] = line
        .split('|')
        .map((part) => part.trim());
      const marks = (marksRaw ?? '')
        .split(',')
        .map((mark) => mark.trim())
        .filter((mark): mark is PCMark => markBank.has(mark as PCMark));
      return {
        id: idRaw || `step_${index + 1}`,
        title: titleRaw,
        slotIndex: Number(slotRaw),
        marks: marks.length > 0 ? marks : undefined,
      };
    })
    .filter(
      (step) =>
        step.id &&
        step.title &&
        Number.isInteger(step.slotIndex) &&
        step.slotIndex >= 0,
    );
}

 function parsePunctuationConstructorSlotExplanations(raw: string) {
  const markBank = new Set<PCMark>([
    'comma',
    'colon',
    'semicolon',
    'dash',
    'quote_open',
    'quote_close',
    'paren_open',
    'paren_close',
    'period',
    'exclamation',
    'question',
    'ellipsis',
  ]);

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [slotIndexRaw, marksRaw, ...textParts] = line.split('|');
      const marks = (marksRaw ?? '')
        .split(',')
        .map((mark) => mark.trim())
        .filter((mark): mark is PCMark => markBank.has(mark as PCMark));
      return {
        slotIndex: Number(slotIndexRaw?.trim()),
        marks: marks.length > 0 ? marks : undefined,
        text: textParts.join('|').trim(),
      };
    })
    .filter(
      (item) =>
        Number.isInteger(item.slotIndex) &&
        item.slotIndex >= 0 &&
        item.text.length > 0,
    );
}

  function applyHistoryState(next: Form) {
 suppressHistoryRef.current = true;
 setForm(next);
 }

 function undoForm() {
 if (historyPastRef.current.length <= 1) return;
 const current = historyPastRef.current.pop();
 if (!current) return;
 historyFutureRef.current.unshift(current);
 const previous = historyPastRef.current[historyPastRef.current.length - 1];
 if (previous) applyHistoryState(previous);
 }

 function redoForm() {
 const next = historyFutureRef.current.shift();
 if (!next) return;
 historyPastRef.current.push(next);
 applyHistoryState(next);
 }

 function buildPayloadFromForm(source: Form): ExerciseEditorInput {
 const skillTags = source.skillTags.split(',').map((v) => v.trim()).filter(Boolean);
 const steps = source.algorithmSteps.split('\n').map((v) => v.trim()).filter(Boolean);
 return {
 id: source.id,
 type: source.type,
 seedKey: source.seedKey || undefined,
 category: source.category,
 difficulty: source.difficulty,
 qualityStatus: source.qualityStatus,
 prompt: source.prompt,
 explanation: source.explanation,
 skillTags,
 sourceAlignment: source.sourceAlignment || undefined,
 typicalMistake: source.typicalMistake || undefined,
 algorithmSteps: steps,
 isActive: source.isActive,
 options:
 source.type === 'multiple_choice' || source.type === 'ege_multi_select'
 ? source.options
 : undefined,
 correctOptionIndex:
 source.type === 'multiple_choice' ? source.correctOptionIndex : undefined,
 multiCorrectOptionIndexes:
 source.type === 'ege_multi_select'
 ? source.multiCorrectOptionIndexes
 .split(',')
 .map((v) => Number(v.trim()))
 .filter((v) => Number.isInteger(v) && v > 0)
 : undefined,
 fillBefore: source.type === 'fill_blank' ? source.fillBefore : undefined,
 fillAfter: source.type === 'fill_blank' ? source.fillAfter : undefined,
 fillAccepted:
 source.type === 'fill_blank'
 ? skillTags.includes('ege.18')
 ? [normalizeNumberAnswerSignature(source.fillAccepted)].filter(Boolean)
 : source.fillAccepted.split(',').map((v) => v.trim()).filter(Boolean)
 : undefined,
 fillCaseSensitive:
 source.type === 'fill_blank' ? source.fillCaseSensitive : undefined,
 wordBankTextWithSlots:
 source.type === 'word_bank_cloze' ? source.wordBankTextWithSlots : undefined,
 wordBankWords:
 source.type === 'word_bank_cloze'
 ? source.wordBankWords.split('\n').map((v) => v.trim()).filter(Boolean)
 : undefined,
 wordBankCorrectBySlot:
 source.type === 'word_bank_cloze'
 ? source.wordBankCorrectBySlot
 .split('\n')
 .map((v) => v.trim())
 .filter(Boolean)
 : undefined,
 wordBankCaseSensitive:
 source.type === 'word_bank_cloze' ? source.wordBankCaseSensitive : undefined,
 wordSearchGridRows:
 source.type === 'word_search'
 ? source.wordSearchGridRows.split('\n').map((v) => v.trim()).filter(Boolean)
 : undefined,
 wordSearchWords:
 source.type === 'word_search'
 ? source.wordSearchWords.split('\n').map((v) => v.trim()).filter(Boolean)
 : undefined,
 wordSearchCaseSensitive:
 source.type === 'word_search' ? source.wordSearchCaseSensitive : undefined,
 dictationTitle:
 source.type === 'dictation' ? source.dictationTitle : undefined,
 dictationAudioSrc:
 source.type === 'dictation' ? source.dictationAudioSrc : undefined,
 dictationPlaybackRates:
 source.type === 'dictation'
 ? source.dictationPlaybackRates
 .split(',')
 .map((value) => Number(value.trim()))
 .filter((value) => Number.isFinite(value) && value > 0)
 : undefined,
 dictationText:
 source.type === 'dictation' ? source.dictationText : undefined,
 dictationCaseSensitive:
 source.type === 'dictation' ? source.dictationCaseSensitive : undefined,
 dictationIgnorePunctuation:
 source.type === 'dictation' ? source.dictationIgnorePunctuation : undefined,
 orthographyRepairText:
 source.type === 'orthography_repair' ? source.orthographyRepairText : undefined,
 orthographyRepairMode:
 source.type === 'orthography_repair' ? source.orthographyRepairMode : undefined,
 orthographyRepairTargets:
 source.type === 'orthography_repair'
 ? parseOrthographyRepairTargets(source.orthographyRepairTargets)
 : undefined,
 orthographyRepairHints:
 source.type === 'orthography_repair'
 ? source.orthographyRepairHints.split('\n').map((v) => v.trim()).filter(Boolean)
 : undefined,
 orthographyRepairRepairs:
 source.type === 'orthography_repair'
 ? parseOrthographyRepairRepairs(source.orthographyRepairRepairs)
 : undefined,
 orthographyRepairCorrectText:
 source.type === 'orthography_repair'
 ? source.orthographyRepairCorrectText
 : undefined,
 orderFragments:
 source.type === 'order_fragments'
 ? source.orderFragments
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
 source.type === 'order_fragments'
 ? source.orderCorrectOrder
 .split(',')
 .map((v) => v.trim())
 .filter(Boolean)
 : undefined,
 punctuationTokens:
 source.type === 'punctuation_insert'
 ? source.punctuationTokens.split('|').map((v) => v.trim()).filter(Boolean)
 : undefined,
 punctuationAllowedMarks:
 source.type === 'punctuation_insert'
 ? (source.punctuationAllowedMarks
 .split(',')
 .map((v) => v.trim())
 .filter(Boolean) as PMark[])
 : undefined,
 punctuationMarks:
 source.type === 'punctuation_insert'
 ? parsePunctuationMarks(source.punctuationMarks)
 : undefined,
 punctuationConstructorTokens:
 source.type === 'punctuation_constructor'
 ? source.punctuationConstructorTokens.split('|').map((v) => v.trim()).filter(Boolean)
 : undefined,
 punctuationConstructorMarkBank:
 source.type === 'punctuation_constructor'
 ? parsePunctuationConstructorMarkBank(source.punctuationConstructorMarkBank)
 : undefined,
 punctuationConstructorHints:
 source.type === 'punctuation_constructor'
 ? source.punctuationConstructorHints.split('\n').map((v) => v.trim()).filter(Boolean)
 : undefined,
 punctuationConstructorGuidedSteps:
 source.type === 'punctuation_constructor'
 ? parsePunctuationConstructorGuidedSteps(source.punctuationConstructorGuidedSteps)
 : undefined,
 punctuationConstructorSegments:
 source.type === 'punctuation_constructor'
 ? parsePunctuationConstructorSegments(source.punctuationConstructorSegments)
 : undefined,
 punctuationConstructorPlacements:
 source.type === 'punctuation_constructor'
 ? parsePunctuationConstructorPlacements(source.punctuationConstructorPlacements)
 : undefined,
 punctuationConstructorSlotExplanations:
 source.type === 'punctuation_constructor'
 ? parsePunctuationConstructorSlotExplanations(source.punctuationConstructorSlotExplanations)
 : undefined,
 ege20TextWithSlots:
 source.type === 'ege20_complex_sentence_punctuation'
 ? source.ege20TextWithSlots
 : undefined,
 ege20Slots:
 source.type === 'ege20_complex_sentence_punctuation'
 ? parseIndexCsv(source.ege20Slots)
 : undefined,
 ege20TargetSet:
 source.type === 'ege20_complex_sentence_punctuation'
 ? parseIndexCsv(source.ege20TargetSet)
 : undefined,
 ege21TargetPunctuation:
 source.type === 'ege21_punctuation_analysis'
 ? source.ege21TargetPunctuation
 : undefined,
 ege21Sentences:
 source.type === 'ege21_punctuation_analysis'
 ? parseEge21SentencesText(source.ege21Sentences)
 : undefined,
 ege21TargetSet:
 source.type === 'ege21_punctuation_analysis'
 ? parseIndexCsv(source.ege21TargetSet)
 : undefined,
 };
 }

 function saveFailureMessage(error: string | undefined, switchCancelled = false) {
 if (error === 'Unauthorized') {
 return 'Сессия истекла. Изменения сохранены локально. Войдите снова, чтобы записать их в базу.';
 }
 const prefix = switchCancelled ? 'Переход отменён. ' : '';
 return `${prefix}Изменения сохранены локально, но не записаны в базу: ${error || 'ошибка сохранения'}.`;
 }

 function cancelPendingAutosaves() {
 if (autosaveTimerRef.current != null) {
 window.clearTimeout(autosaveTimerRef.current);
 autosaveTimerRef.current = null;
 }
 if (autosaveRetryTimerRef.current != null) {
 window.clearTimeout(autosaveRetryTimerRef.current);
 autosaveRetryTimerRef.current = null;
 }
 }

 async function autosaveCurrentToDbIfNeeded(nextId: number) {
 if (!isEdit || !form.id || form.id === nextId || saving || deleting) return true;
 if (deletedExerciseIdsRef.current.has(form.id)) return true;
 const snapshot = JSON.stringify(form);
 if (snapshot === lastPersistedSnapshotRef.current) return true;
 storeLocalDraft(form);
 setDatabaseSaveState('saving');
 const payload = buildPayloadFromForm(form);
 const res = await updateExerciseAction({ ...payload, id: form.id });
 if (res.success) {
 markDatabaseSaveSucceeded(form, snapshot);
 await refreshList({ force: true });
 return true;
 }
 setDatabaseSaveState('local');
 setIsError(true);
 setMessage(saveFailureMessage(res.error, true));
 if (res.error !== 'Unauthorized' && autosaveRetryTimerRef.current == null) {
 autosaveRetryTimerRef.current = window.setTimeout(() => {
 autosaveRetryTimerRef.current = null;
 if (switchingExerciseRef.current || autosaveInFlightRef.current) return;
 void autosaveCurrentToDbIfNeeded(nextId);
 }, 3000);
 }
 return false;
 }

async function openExerciseWithAutosave(id: number) {
 if (switchingExerciseRef.current) return;
 logDraftRecoveryDebug('openExerciseWithAutosave:start', {
 nextId: id,
 currentSelectedId: selectedId,
 currentFormId: form.id ?? null,
 currentFormType: form.type,
 });
 switchingExerciseRef.current = true;
 try {
 const saved = await autosaveCurrentToDbIfNeeded(id);
 logDraftRecoveryDebug('openExerciseWithAutosave:autosaveResult', {
 nextId: id,
 saved,
 currentSelectedId: selectedId,
 currentFormId: form.id ?? null,
 currentFormType: form.type,
 });
 if (!saved) return;
 await loadExercise(id);
 } finally {
 logDraftRecoveryDebug('openExerciseWithAutosave:done', {
 nextId: id,
 finalSelectedId: selectedId,
 finalFormId: latestFormRef.current.id ?? null,
 finalFormType: latestFormRef.current.type,
 });
 switchingExerciseRef.current = false;
 }
}

 useEffect(() => {
 if (!isDraftLoaded || !isEdit || !form.id) return;
 if (saving || deleting || switchingExerciseRef.current) return;
 if (deletedExerciseIdsRef.current.has(form.id)) return;
 const snapshot = JSON.stringify(form);
 if (snapshot === lastPersistedSnapshotRef.current) return;
 const autosaveForm = form;
 const autosaveId = form.id;

 autosaveTimerRef.current = window.setTimeout(async () => {
 if (deletedExerciseIdsRef.current.has(autosaveId)) return;
 if (autosaveInFlightRef.current) return;
 autosaveInFlightRef.current = true;
 try {
 storeLocalDraft(autosaveForm);
 setDatabaseSaveState('saving');
 const payload = buildPayloadFromForm(autosaveForm);
 const res = await updateExerciseAction({ ...payload, id: autosaveId });
 if (deletedExerciseIdsRef.current.has(autosaveId)) return;
 if (res.success) {
 markDatabaseSaveSucceeded(autosaveForm, snapshot);
 await refreshList({ force: true });
 } else {
 setDatabaseSaveState('local');
 setIsError(true);
 setMessage(saveFailureMessage(res.error));
 if (res.error !== 'Unauthorized' && autosaveRetryTimerRef.current == null) {
 autosaveRetryTimerRef.current = window.setTimeout(() => {
 autosaveRetryTimerRef.current = null;
 if (switchingExerciseRef.current || autosaveInFlightRef.current) return;
 if (deletedExerciseIdsRef.current.has(autosaveId)) return;
 const retrySnapshot = JSON.stringify(autosaveForm);
 if (retrySnapshot === lastPersistedSnapshotRef.current) return;
 void (async () => {
 autosaveInFlightRef.current = true;
 try {
 storeLocalDraft(autosaveForm);
 setDatabaseSaveState('saving');
 const retryPayload = buildPayloadFromForm(autosaveForm);
 const retryRes = await updateExerciseAction({ ...retryPayload, id: autosaveId });
 if (deletedExerciseIdsRef.current.has(autosaveId)) return;
 if (retryRes.success) {
 markDatabaseSaveSucceeded(autosaveForm, retrySnapshot);
 await refreshList({ force: true });
 } else {
 setDatabaseSaveState('local');
 setIsError(true);
 setMessage(saveFailureMessage(retryRes.error));
 }
 } finally {
 autosaveInFlightRef.current = false;
 }
 })();
 }, 3000);
 }
 }
 } finally {
 autosaveInFlightRef.current = false;
 }
 }, 2000);

 return () => {
 if (autosaveTimerRef.current != null) {
 window.clearTimeout(autosaveTimerRef.current);
 autosaveTimerRef.current = null;
 }
 };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [form, isDraftLoaded, isEdit, saving, deleting]);

 async function onSubmit(event: React.FormEvent) {
 event.preventDefault();
 setSaving(true);
 setDatabaseSaveState('saving');
 setMessage('');
 setIsError(false);
 const payload = buildPayloadFromForm(form);

 const wasEdit = isEdit;
 const res = wasEdit
 ? await updateExerciseAction({ ...payload, id: form.id! })
 : await createExerciseAction(payload);

 if (res.success) {
 setMessage(wasEdit ? 'Изменения сохранены.' : 'Задание создано.');
 localStorage.removeItem(getDraftKey(form.id));
 if (form.id) clearPendingDraftMarker(form.id);
 const nextForm = wasEdit ? form : loadFormState(null, EMPTY);
 setForm(nextForm);
 if (wasEdit) {
  markDatabaseSaveSucceeded(form, JSON.stringify(form));
 } else {
  lastPersistedSnapshotRef.current = JSON.stringify(nextForm);
  setDatabaseSaveState('draft');
  setDatabaseSavedAt(null);
 }
 if (!wasEdit) {
 setTotalItems((current) => (current === null ? current : current + 1));
 }
 await refreshList({ force: true });
 } else {
 storeLocalDraft(form);
 setDatabaseSaveState('local');
 setIsError(true);
 setMessage(saveFailureMessage(res.error));
 }

 setSaving(false);
 }

 async function handleDeleteExercise() {
 if (!isEdit || deleting) return;
 setShowDeleteConfirmModal(false);
 cancelPendingAutosaves();
 setDeleting(true);
 setMessage('');
 setIsError(false);

 const deletedId = form.id!;
 deletedExerciseIdsRef.current.add(deletedId);
 const res = await deleteExerciseAction(deletedId);
 if (res.success) {
 setMessage('Задание удалено.');
 localStorage.removeItem(getDraftKey(form.id));
 clearPendingDraftMarker(deletedId);
 setForm(loadFormState(null, EMPTY));
 setSelectedId(null);
 setDatabaseSaveState('draft');
 setDatabaseSavedAt(null);
 clearExerciseUrlSelection();
 setPreviewCheckResult(null);
 setIsSeedRegenerateArmed(false);
 setShowSeedRegenerateModal(false);
 setShowDeleteConfirmModal(false);
 setItems((current) => current.filter((item) => item.id !== deletedId));
 setTotalItems((current) => (current === null ? current : Math.max(0, current - 1)));
 setMatchingItems((current) =>
  hasActiveListFilter && current !== null ? Math.max(0, current - 1) : current,
 );
 await refreshList({ force: true });
 } else {
 setIsError(true);
 setMessage(res.error || 'Ошибка удаления.');
 }

 setDeleting(false);
 }

 const databaseIndicator = databaseSaveState === 'saved'
  ? {
   label: 'В БД',
   detail: databaseSavedAt
    ? `сохранено ${formatAdminTime(databaseSavedAt)}`
    : 'актуальная версия',
    box: 'border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
   dot: 'bg-emerald-500',
  }
  : databaseSaveState === 'saving'
   ? {
    label: 'Сохранение...',
    detail: 'запись в БД',
     box: 'border-sky-200 bg-sky-50/80 text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200',
    dot: 'animate-pulse bg-sky-500',
   }
   : databaseSaveState === 'local'
    ? {
     label: 'Только локально',
     detail: 'ждёт записи в БД',
      box: 'border-amber-200 bg-amber-50/80 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
     dot: 'bg-amber-500',
    }
    : {
     label: 'Новый черновик',
     detail: 'ещё не в БД',
      box: 'border-stroke bg-surface text-foreground/65 dark:bg-foreground/5',
     dot: 'bg-foreground/25',
    };

 return (
 <div className="mx-auto grid w-full max-w-[1400px] gap-5 items-start xl:grid-cols-[300px_minmax(0,1fr)]">
 <aside ref={sidebarRef} className="flex h-[60vh] flex-col rounded-2xl border border-stroke bg-surface-strong p-4 text-foreground shadow-sm xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]">
 <div className="mb-4 flex items-center justify-between">
 <div>
  <div className="flex items-center gap-2">
   <h3 className="text-xl font-bold tracking-tight">Задания</h3>
   <span className="inline-flex h-5 items-center justify-center rounded-full bg-primary/10 px-2 text-[11px] font-semibold text-primary">
    {hasActiveListFilter && matchingItems !== null ? `${matchingItems} / ` : ''}
    {totalItems ?? '...'}
   </span>
  </div>
  <p className="mt-0.5 text-[11px] font-medium text-foreground/50">
   {initialListPending ? 'Загрузка списка...' : `Показано: ${flatFilteredItems.length}`}
  </p>
 </div>
 <div className="flex items-center gap-1.5">
 <button
 className="group relative flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition hover:bg-stroke hover:text-foreground"
                  onClick={() => void refreshList({ includeTotal: true, force: true })}
 >
 <RefreshCw className="h-4 w-4" />
 <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
 Обновить список
 </span>
 </button>
 {!selectionMode ? (
 <button
 className="group relative flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition hover:bg-stroke hover:text-primary"
 onClick={() => setSelectionMode(true)}
 >
 <CheckSquare className="h-4 w-4" />
 <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
 Выбрать задания
 </span>
 </button>
 ) : (
 <button
 className="group relative flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition hover:bg-red-500/10 hover:text-red-500"
 onClick={clearMultiSelection}
 >
 <XSquare className="h-4 w-4" />
 <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
 Отмена выбора
 </span>
 </button>
 )}
 </div>
 </div>
 <div
  aria-live="polite"
   className={`mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${databaseIndicator.box}`}
 >
  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${databaseIndicator.dot}`} />
  <span>{databaseIndicator.label}</span>
  {databaseIndicator.detail && (
    <span className="opacity-70">· {databaseIndicator.detail}</span>
  )}
 </div>
 {selectionMode && (
 <button
 type="button"
 onClick={selectAllShownItems}
 disabled={flatFilteredItems.length === 0}
 className="mb-3 w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-xs font-medium text-foreground/80 transition hover:bg-stroke disabled:cursor-not-allowed disabled:opacity-60"
 >
 Выбрать все показанные ({flatFilteredItems.length})
 </button>
 )}
 {selectionMode && multiSelectedIds.length > 0 && (
 <div className="mb-3 space-y-2 rounded-lg border border-stroke bg-surface p-2">
 <div className="flex items-center gap-1 text-xs font-semibold text-foreground/80">
 <span>Выбрано: {multiSelectedIds.length}</span>
 <span className="relative inline-flex">
 <button
 type="button"
 className="group inline-flex h-4 w-4 items-center justify-center rounded-full border border-stroke bg-surface-strong text-[10px] font-bold text-foreground/70 hover:bg-stroke focus:outline-none"
 aria-label="Подсказка по массовым действиям"
 >
 i
 <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-52 -translate-x-1/2 rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block group-focus-visible:block">
 Действия применяются к выделенным заданиям.
 </span>
 </button>
 </span>
 </div>
 <div className="grid grid-cols-2 gap-2">
 <span className="group relative block w-full h-full">
 <button
 type="button"
 onClick={() => void applyBatchStatus()}
 disabled={batchSaving}
 className="h-full w-full rounded-md border border-stroke bg-surface-strong px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-stroke disabled:opacity-60"
 >
 Применить статус
 </button>
 <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-48 -translate-x-1/2 rounded-md border border-stroke bg-surface-strong px-2.5 py-1.5 text-[11px] font-normal leading-snug text-foreground/80 shadow-md whitespace-normal text-center group-hover:block">
 Изменить статус у выделенных.
 </span>
 </span>
 <span className="group relative block w-full h-full">
 <button
 type="button"
 onClick={() => void applyBatchActivity()}
 disabled={batchSaving}
 className="h-full w-full rounded-md border border-stroke bg-surface-strong px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-stroke disabled:opacity-60"
 >
 Применить активность
 </button>
 <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-48 -translate-x-1/2 rounded-md border border-stroke bg-surface-strong px-2.5 py-1.5 text-[11px] font-normal leading-snug text-foreground/80 shadow-md whitespace-normal text-center group-hover:block">
 Вкл/выкл выделенные задания.
 </span>
 </span>
 </div>
 <div className="grid grid-cols-2 gap-2">
 <span className="group relative block w-full h-full">
 <button
 type="button"
 onClick={() => setShowMoreBatchActions((v) => !v)}
 className="h-full w-full rounded-md border border-stroke bg-surface-strong px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-stroke disabled:opacity-60"
 >
 Параметры
 </button>
 <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-48 -translate-x-1/2 rounded-md border border-stroke bg-surface-strong px-2.5 py-1.5 text-[11px] font-normal leading-snug text-foreground/80 shadow-md whitespace-normal text-center group-hover:block">
 Показать/скрыть расширенные параметры.
 </span>
 </span>
 <span className="group relative block w-full h-full">
 <button
 type="button"
 onClick={clearMultiSelection}
 className="h-full w-full rounded-md border border-stroke bg-surface-strong px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-stroke"
 >
 Снять выделение
 </button>
 <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-48 -translate-x-1/2 rounded-md border border-stroke bg-surface-strong px-2.5 py-1.5 text-[11px] font-normal leading-snug text-foreground/80 shadow-md whitespace-normal text-center group-hover:block">
 Снять текущее выделение.
 </span>
 </span>
 </div>
 {showMoreBatchActions ? (
 <div className="grid grid-cols-1 gap-2">
 <Select
              value={batchStatus}
              onValueChange={(value) => setBatchStatus(value as typeof batchStatus)}
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {qualityStatuses.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
 <Select
              value={batchIsActive}
              onValueChange={(value) => setBatchIsActive(value as typeof batchIsActive)}
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Активно</SelectItem>
                <SelectItem value="inactive">Неактивно</SelectItem>
              </SelectContent>
            </Select>
 </div>
 ) : null}
 </div>
 )}
 <div className="mb-4 space-y-3">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
 <input
 className={`${inputClass} pl-9`}
 placeholder="Поиск: id / seed_key / текст"
 value={listQuery}
 onChange={(e) => setListQuery(e.target.value)}
 />
 </div>
 <div className="grid grid-cols-2 gap-2">
 <Select
            value={listTypeFilter}
            onValueChange={(value) => setListTypeFilter(value)}
          >
            <SelectTrigger className={inputClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {listTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type === 'all' ? 'Все типы' : type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
 <Select
            value={listExamTypeFilter}
            onValueChange={(value) => setListExamTypeFilter(value)}
          >
            <SelectTrigger className={inputClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {listExamTypes.map((n) => (
                <SelectItem key={n} value={n}>
                  {n === 'all' ? 'ЕГЭ: все' : `ЕГЭ: ${n}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
 </div>
 <div className="grid grid-cols-1 gap-2">
 <Select
            value={listStatusFilter}
            onValueChange={(value) => setListStatusFilter(value)}
          >
            <SelectTrigger className={inputClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {qualityStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
 </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-foreground/50">
              <span className="uppercase tracking-wider">Сортировка</span>
              {sortPrefsReady && (listSortBy !== 'id' || listSortDir !== 'asc') && (
                <button
                  type="button"
                  onClick={() => {
                    setListSortBy('id');
                    setListSortDir('asc');
                  }}
                  className="group relative flex items-center gap-1 hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  Сбросить
                  <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
                    Сбросить сортировку
                  </span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              {sortPrefsReady ? (
                <>
                  <Select
                    value={listSortBy}
                    onValueChange={(value) => setListSortBy(value as typeof listSortBy)}
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="id">По номеру</SelectItem>
                      <SelectItem value="updatedAt">По дате изменения</SelectItem>
                      <SelectItem value="type">По типу</SelectItem>
                      <SelectItem value="status">По статусу</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => setListSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    className="group relative flex w-10 self-stretch items-center justify-center rounded-lg border border-stroke bg-surface-strong text-foreground/70 transition hover:bg-stroke hover:text-foreground"
                  >
                    {listSortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                    <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
                      {listSortDir === 'asc' ? 'По возрастанию' : 'По убыванию'}
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <div className="h-10 w-full rounded-lg border border-stroke bg-surface animate-pulse" />
                  <div className="h-10 w-10 rounded-lg border border-stroke bg-surface animate-pulse" />
                </>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-stroke/70 bg-surface/30 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/50">Raw HTML Preview</div>
            <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-2">
              <input
                className={`${inputClass} bg-surface-strong`}
                placeholder="Файл (напр. 56151015)"
                value={rawPreviewFilter}
                onChange={(e) => setRawPreviewFilter(e.target.value)}
              />
              <input
                className={`${inputClass} bg-surface-strong`}
                type="number"
                min={1}
                max={20}
                value={rawPreviewLimit}
                onChange={(e) => setRawPreviewLimit(Math.max(1, Math.min(20, Number(e.target.value) || 3)))}
              />
            </div>
            <button
              type="button"
              className="mt-2 w-full rounded-lg bg-foreground/5 px-3 py-2 text-xs font-medium text-foreground/80 transition hover:bg-foreground/10 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void runRawPreviewAudit()}
              disabled={rawPreviewLoading}
            >
              {rawPreviewLoading ? 'Сканирование...' : 'Сканировать raw HTML'}
            </button>
            {rawPreviewItems.length > 0 ? (
              <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                {rawPreviewItems.map((item) => (
                  <div key={item.file} className="rounded-md border border-stroke bg-surface-strong p-2 text-xs">
                    <div className="font-semibold text-foreground/80">{item.file}</div>
                    <div className="mt-1 text-foreground/70">
                      пробелы-перед-пунктуацией: {item.beforeIssues.spacesBeforePunct} → {item.afterIssues.spacesBeforePunct}
                    </div>
                    <div className="mt-1 grid gap-1">
                      <div className="rounded border border-stroke bg-surface p-1 text-foreground/70">
                        <span className="font-medium">До:</span> {item.beforeSnippet}
                      </div>
                      <div className="rounded border border-stroke bg-surface p-1 text-foreground/70">
                        <span className="font-medium">После:</span> {item.afterSnippet}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
 {groupedItems.map(([type, typeItems]) => (
 <div key={type} className="space-y-2">
 <div className="sticky top-0 z-10 rounded-md border border-stroke bg-surface px-2 py-1 text-xs font-semibold text-foreground/80">
 {type} · {typeItems.length}
 </div>
 {typeItems.map((item) => (
 <button
 key={item.id}
 onClick={(e) => toggleMultiSelectionByClick(item.id, e)}
 onDoubleClick={() => {
 if (selectionMode) void openExerciseWithAutosave(item.id);
 }}
 onKeyDown={(e) => {
 if (selectionMode && e.key === 'Enter') {
 e.preventDefault();
 void openExerciseWithAutosave(item.id);
 }
 }}
 className={`w-full rounded-xl border p-3 text-left transition focus:outline-none ${
 multiSelectedSet.has(item.id)
 ? 'border-primary/50 bg-primary/10'
 : selectedId === item.id
 ? 'border-foreground/30 bg-foreground/5'
 : 'border-stroke hover:border-stroke hover:bg-foreground/5'
 }`}
 >
 {selectionMode ? (
 <div className="mb-1 flex items-center justify-between">
 <span className="text-[10px] text-foreground/60">Shift/Ctrl</span>
 {multiSelectedSet.has(item.id) ? (
 <span className="text-[10px] font-semibold text-primary">выбрано</span>
 ) : null}
 </div>
 ) : null}
 <div className="text-xs text-foreground/70">
 #{item.id} • {item.qualityStatus}
 </div>
 <div className="mt-0.5 text-[11px] text-foreground/60">
 обновлено: {formatUpdatedAt(item.updatedAt)}
 </div>
 <div className="line-clamp-2 text-sm text-foreground">{item.prompt}</div>
 </button>
 ))}
 </div>
 ))}
 {initialListPending ? (
 <div className="space-y-2">
 <div className="h-6 rounded-md border border-stroke bg-surface animate-pulse" />
 <div className="h-20 rounded-xl border border-stroke bg-surface animate-pulse" />
 <div className="h-20 rounded-xl border border-stroke bg-surface animate-pulse" />
 <div className="h-20 rounded-xl border border-stroke bg-surface animate-pulse" />
 <div className="h-20 rounded-xl border border-stroke bg-surface animate-pulse" />
 <div className="h-20 rounded-xl border border-stroke bg-surface animate-pulse" />
 </div>
 ) : groupedItems.length === 0 && (
 <div className="rounded-lg border border-dashed border-stroke px-3 py-4 text-sm text-foreground/60">
 Ничего не найдено по текущим фильтрам.
 </div>
 )}
 {hasMore && (
 <div className="mt-2 text-center">
 <div className="mb-2 text-[11px] font-medium text-foreground/50">
  Можно загрузить ещё
 </div>
 <button
 type="button"
 onClick={() => void loadMore()}
 disabled={loadingMore}
 className="w-full rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-medium text-foreground/80 transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
 >
 {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
 </button>
 </div>
 )}
 </div>
 </aside>

 <div className={`rounded-2xl border border-stroke bg-surface-strong p-5 shadow-sm ${initialSelectionPending && !initialSelectedExercise ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-opacity`}>
 <div className="mb-4 flex items-center justify-between">
 <h2 className="text-xl font-semibold text-foreground ">
 {isEdit ? 'Редактирование задания' : 'Создание задания'}
 </h2>
 {hasUnsavedChanges ? <span className="text-xs font-medium text-amber-600">Есть несохранённые изменения</span> : null}
 <div className="flex items-center gap-2">
 <button
 type="button"
 className="rounded-md px-2 py-1 text-xs font-medium text-foreground/70 hover:bg-stroke"
 onClick={undoForm}
 title="Undo"
 >
 Undo
 </button>
 <button
 type="button"
 className="rounded-md px-2 py-1 text-xs font-medium text-foreground/70 hover:bg-stroke"
 onClick={redoForm}
 title="Redo"
 >
 Redo
 </button>
 <button
 type="button"
 className="rounded-md px-2 py-1 text-xs font-medium text-foreground/70 hover:bg-stroke"
 onClick={() => {
 setForm(loadFormState(null, EMPTY));
 setSelectedId(null);
 setDatabaseSaveState('draft');
 setDatabaseSavedAt(null);
 clearExerciseUrlSelection();
 setMessage('');
 setIsSeedRegenerateArmed(false);
 setShowSeedRegenerateModal(false);
 }}
 >
 Новый черновик
 </button>
 </div>
 </div>

 {message && (
 <div
 className={`fixed right-6 bottom-6 z-50 mb-4 max-w-[min(36rem,calc(100vw-3rem))] rounded-xl border px-5 py-3 text-sm leading-6 font-medium whitespace-normal break-words shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-5 ${
 isError
 ? 'border-red-200 bg-red-50 text-red-700'
 : 'border-emerald-200 bg-emerald-50 text-emerald-700'
 }`}
 >
 {message}
 </div>
 )}

 <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
 <form
 ref={formRef}
 onSubmit={onSubmit}
 onMouseUpCapture={(e) => updateActiveMarksFromTarget(e.target)}
 onKeyUpCapture={(e) => updateActiveMarksFromTarget(e.target)}
 >
 <div className="grid gap-3 sm:grid-cols-3">
 <Input label="Тип">
 <Select
                      value={form.type}
                      onValueChange={(value) => {
                        const nextType = value as Form['type'];
                        setForm((f) => {
                          const nextForm = convertFormForTypeChange(f, nextType);
                          const transferMessage = buildTypeChangeMessage(f, nextForm);
                          if (transferMessage) {
                            setIsError(false);
                            setMessage(transferMessage);
                          }
                          return nextForm;
                        });
                      }}
                    >
                      <SelectTrigger className={inputClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {typeOptions.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
 </Input>
 <Input label="Категория">
 <Select
              value={form.category}
              onValueChange={(value) =>
                setForm((f) => ({
                  ...f,
                  category: value as ExerciseCategory,
                }))
              }
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
 </Input>
 <Input label="Сложность">
 <Select
              value={String(form.difficulty)}
              onValueChange={(value) =>
                setForm((f) => ({ ...f, difficulty: Number(value) as 1 | 2 }))
              }
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
              </SelectContent>
            </Select>
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
 className="shrink-0 rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-xs font-semibold text-foreground/80 transition hover:bg-surface"
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
 <div className="mb-1 text-sm font-medium text-foreground/80">Формулировка</div>
 <MDEditor
 value={form.prompt}
 onChange={(val) => {
 setForm((f) => ({ ...f, prompt: val || '' }));
 }}
 data-color-mode={currentTheme === 'dark' ? 'dark' : 'light'}
 className="w-full"
 height={205}
 commands={markdownCommands}
 extraCommands={markdownExtraCommands}
 />
 </div>
 <div className="mt-3">
 <div className="mb-1 text-sm font-medium text-foreground/80">Объяснение</div>
 <MDEditor
 value={form.explanation}
 onChange={(val) => {
 setForm((f) => ({ ...f, explanation: val || '' }));
 }}
 data-color-mode={currentTheme === 'dark' ? 'dark' : 'light'}
 className="w-full"
 height={205}
 commands={markdownCommands}
 extraCommands={markdownExtraCommands}
 />
 </div>

 {(form.type === 'multiple_choice' || form.type === 'ege_multi_select') && (
 <div className="mt-3 space-y-2">
 <div className="text-sm font-medium text-foreground/80">Варианты ответа</div>
 {form.options.map((option, index) => (
 <div key={index} className="flex items-center gap-2">
 {form.type === 'multiple_choice' ? (
 <input
 type="radio"
 checked={form.correctOptionIndex === index}
 onChange={() => setForm((f) => ({ ...f, correctOptionIndex: index }))}
 />
 ) : (
 <span className="inline-flex w-5 justify-center text-xs font-semibold text-foreground/60">
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
 className="rounded-md border border-stroke px-2 py-1 text-xs text-foreground/80 hover:bg-surface"
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

 {form.type === 'dictation' && (
 <div className="mt-3 space-y-3">
 <Input label="Название диктанта">
 <input
 className={inputClass}
 value={form.dictationTitle}
 onChange={(e) =>
 setForm((f) => ({ ...f, dictationTitle: e.target.value }))
 }
 placeholder="Цифровой след"
 />
 </Input>
 <Input label="Путь к аудио">
 <input
 className={inputClass}
 value={form.dictationAudioSrc}
 onChange={(e) =>
 setForm((f) => ({ ...f, dictationAudioSrc: e.target.value }))
 }
 placeholder="/voice_memos/audio_2026-06-08_00-53-43.ogg"
 />
 </Input>
 <Input label="Скорости воспроизведения">
 <input
 className={inputClass}
 value={form.dictationPlaybackRates}
 onChange={(e) =>
 setForm((f) => ({ ...f, dictationPlaybackRates: e.target.value }))
 }
 placeholder="0.75, 1, 1.25, 1.5"
 />
 </Input>
 <Input label="Эталонная расшифровка">
 <textarea
 className={inputClass}
 rows={6}
 value={form.dictationText}
 onChange={(e) =>
 setForm((f) => ({ ...f, dictationText: e.target.value }))
 }
 placeholder="Текст, который должен повторить ученик."
 />
 </Input>
 <div className="grid gap-3 sm:grid-cols-2">
 <label className="flex items-center gap-2 rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-medium text-foreground/80">
 <input
 type="checkbox"
 checked={form.dictationCaseSensitive}
 onChange={(e) =>
 setForm((f) => ({ ...f, dictationCaseSensitive: e.target.checked }))
 }
 />
 Учитывать регистр
 </label>
 <label className="flex items-center gap-2 rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-medium text-foreground/80">
 <input
 type="checkbox"
 checked={form.dictationIgnorePunctuation}
 onChange={(e) =>
 setForm((f) => ({ ...f, dictationIgnorePunctuation: e.target.checked }))
 }
 />
 Игнорировать пунктуацию
 </label>
 </div>
 </div>
 )}

 {form.type === 'orthography_repair' && (
 <div className="mt-3 space-y-3">
 <Input label="Текст с ошибкой">
 <textarea
 className={inputClass}
 rows={4}
 value={form.orthographyRepairText}
 onChange={(e) =>
 setForm((f) => ({ ...f, orthographyRepairText: e.target.value }))
 }
 placeholder="Имейте ввиду, что она займет у Вас целый день."
 />
 </Input>
 <Input label="Режим">
 <Select
 value={form.orthographyRepairMode}
 onValueChange={(value) =>
 setForm((f) => ({
 ...f,
 orthographyRepairMode:
 value === 'click_then_type' ? 'click_then_type' : 'click_then_choose',
 }))
 }
 >
 <SelectTrigger className={inputClass}>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="click_then_choose">click_then_choose</SelectItem>
 <SelectItem value="click_then_type">click_then_type</SelectItem>
 </SelectContent>
 </Select>
 </Input>
 <Input label="Targets (id | surface | replacement | type | options | occurrence)">
 <textarea
 className={inputClass}
 rows={5}
 value={form.orthographyRepairTargets}
 onChange={(e) =>
 setForm((f) => ({ ...f, orthographyRepairTargets: e.target.value }))
 }
 placeholder="target_1 | ввиду | в виду | span | ввиду, в виду, в-виду"
 />
 </Input>
 <Input label="Repairs (targetId | correct)">
 <textarea
 className={inputClass}
 rows={3}
 value={form.orthographyRepairRepairs}
 onChange={(e) =>
 setForm((f) => ({ ...f, orthographyRepairRepairs: e.target.value }))
 }
 placeholder="target_1 | в виду"
 />
 </Input>
 <Input label="Подсказки (по одной на строку)">
 <textarea
 className={inputClass}
 rows={3}
 value={form.orthographyRepairHints}
 onChange={(e) =>
 setForm((f) => ({ ...f, orthographyRepairHints: e.target.value }))
 }
 placeholder={'Ошибка в устойчивом сочетании.\nПравильно: иметь в виду.'}
 />
 </Input>
 <Input label="Правильный текст целиком (optional)">
 <textarea
 className={inputClass}
 rows={3}
 value={form.orthographyRepairCorrectText}
 onChange={(e) =>
 setForm((f) => ({ ...f, orthographyRepairCorrectText: e.target.value }))
 }
 placeholder="Полный текст после исправления, только для показа."
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

 {form.type === 'punctuation_constructor' && (
 <div className="mt-3 space-y-3">
 <Input label="Токены предложения (через |)">
 <textarea
 className={inputClass}
 rows={2}
 value={form.punctuationConstructorTokens}
 onChange={(e) =>
 setForm((f) => ({ ...f, punctuationConstructorTokens: e.target.value }))
 }
 placeholder="Мне | сказали | Ждите | приедет | другой | замерщик"
 />
 </Input>
 <Input label="Банк знаков: period, comma, semicolon, colon, question, exclamation, quote_open, quote_close, paren_open, paren_close, dash, ellipsis">
 <input
 className={inputClass}
 value={form.punctuationConstructorMarkBank}
 onChange={(e) =>
 setForm((f) => ({ ...f, punctuationConstructorMarkBank: e.target.value }))
 }
 />
 </Input>
 <Input label="Подсказки (по одной на строку)">
 <textarea
 className={inputClass}
 rows={3}
 value={form.punctuationConstructorHints}
 onChange={(e) =>
 setForm((f) => ({ ...f, punctuationConstructorHints: e.target.value }))
 }
 placeholder={'В предложении есть прямая речь.\nПосле слов автора нужен знак.'}
 />
 </Input>
 <Input label="Пошаговый режим (id | title | slot | marks)">
 <textarea
 className={inputClass}
 rows={4}
 value={form.punctuationConstructorGuidedSteps}
 onChange={(e) =>
 setForm((f) => ({
 ...f,
 punctuationConstructorGuidedSteps: e.target.value,
 }))
 }
 placeholder={'author_end | Где заканчиваются слова автора? | 2 | colon\nopen_quote | Где начинается прямая речь? | 2 | quote_open'}
 />
 </Input>
 <Input label="Правильные слоты (slot:mark)">
 <input
 className={inputClass}
 value={form.punctuationConstructorPlacements}
 onChange={(e) =>
 setForm((f) => ({
 ...f,
 punctuationConstructorPlacements: e.target.value,
 }))
 }
 placeholder="2:colon, 2:quote_open, 3:comma, 6:quote_close, 6:period"
 />
 </Input>
 <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
 <div className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-emerald-700">
 Правильный ответ
 </div>
 <div className="text-base font-semibold leading-7 text-emerald-950">
 {renderPunctuationConstructorAnswer(
 form.punctuationConstructorTokens,
 form.punctuationConstructorPlacements,
 ) || 'Заполните токены и правильные слоты'}
 </div>
 </div>
 <Input label="Разбор слотов (slot | marks | text)">
 <textarea
 className={inputClass}
 rows={3}
 value={form.punctuationConstructorSlotExplanations}
 onChange={(e) =>
 setForm((f) => ({
 ...f,
 punctuationConstructorSlotExplanations: e.target.value,
 }))
 }
 placeholder={'2 | colon, quote_open | После слов автора ставится двоеточие и открываются кавычки.\n6 | quote_close, period | Реплика закрывается кавычкой, затем ставится точка.'}
 />
 </Input>
 <Input label="Структура (label | tokenStart | tokenEnd | kind)">
 <textarea
 className={inputClass}
 rows={2}
 value={form.punctuationConstructorSegments}
 onChange={(e) =>
 setForm((f) => ({ ...f, punctuationConstructorSegments: e.target.value }))
 }
 placeholder={'Слова автора | 0 | 1 | author_words\nПрямая речь | 2 | 5 | direct_speech'}
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
 <Select
              value={form.ege21TargetPunctuation}
              onValueChange={(value) =>
                setForm((f) => ({
                  ...f,
                  ege21TargetPunctuation: value as Form['ege21TargetPunctuation'],
                }))
              }
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comma">comma</SelectItem>
                <SelectItem value="dash">dash</SelectItem>
                <SelectItem value="colon">colon</SelectItem>
                <SelectItem value="semicolon">semicolon</SelectItem>
              </SelectContent>
            </Select>
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
 <Select
              value={form.qualityStatus}
              onValueChange={(value) =>
                setForm((f) => ({
                  ...f,
                  qualityStatus: value as Form['qualityStatus'],
                }))
              }
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {qualityStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
 </Input>
 <Input label="Активность">
 <Select
              value={form.isActive ? 'active' : 'inactive'}
              onValueChange={(value) =>
                setForm((f) => ({ ...f, isActive: value === 'active' }))
              }
            >
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Активно</SelectItem>
                <SelectItem value="inactive">Неактивно</SelectItem>
              </SelectContent>
            </Select>
 </Input>
 </div>

 <div ref={mainSaveAnchorRef} className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
 <button
 disabled={saving || deleting}
 className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-slate-700"
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
 onClick={() => setShowDeleteConfirmModal(true)}
 className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-600 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
 >
 {deleting ? 'Удаление...' : 'Удалить'}
 </button>
 ) : null}
 </div>
 </form>

 <div className="h-fit rounded-2xl border border-stroke bg-surface-strong p-4 2xl:sticky 2xl:top-4">
 <div className="mb-2 flex items-center justify-between gap-2">
 <h3 className="text-sm font-semibold text-foreground ">Превью в чате</h3>
 <div className="inline-flex rounded-md border border-stroke bg-surface p-0.5 text-xs ">
 <button
 type="button"
 onClick={() => setPreviewMode('desktop')}
 className={`rounded px-2 py-1 ${
 previewMode === 'desktop'
 ? 'bg-primary text-white'
 : 'text-foreground/80 hover:bg-stroke'
 }`}
 >
 Desktop
 </button>
 <button
 type="button"
 onClick={() => setPreviewMode('mobile')}
 className={`rounded px-2 py-1 ${
 previewMode === 'mobile'
 ? 'bg-primary text-white'
 : 'text-foreground/80 hover:bg-stroke'
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
 <div className="mb-2 rounded-xl bg-surface px-4 py-3 text-sm text-foreground shadow-sm [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_p]:mb-2 [&_p:last-child]:mb-0">
 <ReactMarkdown rehypePlugins={[rehypeRaw]}>{renderEditorMarkdown(preview.exercise.prompt)}</ReactMarkdown>
 </div>
        <ExerciseRenderer
          exercise={preview.exercise}
          onSubmit={handlePreviewSubmit}
          previewMode={true}
        />
        {preview.exercise.type === 'dictation' ? (
          <form onSubmit={handlePreviewDictationSubmit} className="mt-3 space-y-2">
            <textarea
              rows={3}
              value={previewDictationText}
              onChange={(event) => {
                setPreviewDictationText(event.target.value);
                setPreviewCheckResult(null);
              }}
              placeholder="Введите услышанный текст для проверки..."
              className="w-full resize-y rounded-xl border border-stroke bg-surface px-3 py-2 text-sm leading-6 text-foreground outline-none transition placeholder:text-foreground/45 focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={!previewDictationText.trim()}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-[var(--stroke)]"
            >
              Проверить диктант
            </button>
          </form>
        ) : null}
  {previewCheckResult && (
  <div
  className={`relative mt-3 rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full ${
  preview.exercise.type === 'dictation'
  ? 'border-cyan-200 bg-cyan-50 text-cyan-950 before:bg-cyan-400 dark:border-cyan-300/25 dark:bg-surface-strong dark:text-foreground dark:before:bg-cyan-300/65'
  :
  previewCheckResult.isCorrect
  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 before:bg-emerald-400 dark:border-emerald-300/25 dark:bg-surface-strong dark:text-foreground dark:before:bg-emerald-300/65 [&>p:first-child]:dark:text-emerald-200'
  : 'border-amber-200 bg-amber-50 text-amber-900 before:bg-amber-400 dark:border-amber-300/25 dark:bg-surface-strong dark:text-foreground dark:before:bg-amber-300/70 [&>p:first-child]:dark:text-amber-200'
  }`}
  >
 {previewFeedbackSections ? (
 <div className="space-y-3">
 {previewFeedbackSections.lead ? (
 <ReactMarkdown rehypePlugins={[rehypeRaw]}>{renderEditorMarkdown(previewFeedbackSections.lead)}</ReactMarkdown>
 ) : null}
 <div className="rounded-xl border border-emerald-200 bg-emerald-100/60 px-3 py-2 text-emerald-900 dark:border-emerald-600/30 dark:bg-emerald-950/30 dark:text-emerald-200">
 <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
 Правильный ответ
 </div>
 <ReactMarkdown rehypePlugins={[rehypeRaw]}>{renderEditorMarkdown(previewFeedbackSections.correctAnswer)}</ReactMarkdown>
 </div>
 <div className="rounded-xl border border-stroke bg-surface-strong/70 px-3 py-2 text-foreground">
 <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/80 ">
 Объяснение
 </div>
 <FormattedFeedbackExplanation text={previewFeedbackSections.explanation} />
 </div>
 </div>
 ) : (
 <ReactMarkdown rehypePlugins={[rehypeRaw]}>{renderEditorMarkdown(previewCheckResult.text)}</ReactMarkdown>
 )}
 </div>
 )}
 </div>
 ) : (
 <p className="text-sm text-foreground/60">Заполните поля задания для превью.</p>
 )}
 </div>
 </div>
 </div>

 <div
 className={`fixed right-6 bottom-6 z-40 hidden xl:block transition-all duration-200 ${
 showFloatingSave ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
 }`}
 >
 <button
 type="button"
 onClick={() => formRef.current?.requestSubmit()}
 disabled={!showFloatingSave || saving || deleting}
 className={`rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-slate-700 ${
 showFloatingSave ? 'pointer-events-auto' : 'pointer-events-none'
 }`}
 >
 {saving
 ? 'Сохранение...'
 : isEdit
 ? 'Сохранить изменения'
 : 'Создать задание'}
 </button>
 </div>

 {draftRecovery && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm transition-all">
 <div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-stroke/50 bg-surface-strong shadow-2xl">
 <div className="border-b border-stroke/50 bg-surface/30 p-6">
 <div className="flex items-center gap-4">
 <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 shadow-sm">
 <History className="h-6 w-6" />
 </div>
 <div>
 <p className="text-[11px] font-bold uppercase tracking-wider text-amber-500">
 Локальная страховочная копия
 </p>
 <h4 className="mt-1 text-lg font-bold tracking-tight text-foreground">
 Восстановление задания #{draftRecovery.id}
 </h4>
 </div>
 </div>
 </div>
 <div className="p-6">
 <p className="text-sm leading-relaxed text-foreground/75">
 В браузере осталась версия, которая отличается от данных в базе. Можно восстановить её и продолжить редактирование
 или отказаться от неё и открыть текущую версию из базы.
 </p>
 <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
 <button
 type="button"
 className="rounded-xl border border-stroke/60 bg-surface px-4 py-3 text-sm font-semibold text-foreground/70 transition-all hover:bg-stroke/40 hover:text-foreground"
 onClick={useDatabaseVersion}
 >
 Использовать версию из БД
 </button>
 <button
 type="button"
 className="rounded-xl bg-gradient-to-r from-primary to-primary-strong px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-all hover:-translate-y-0.5 hover:shadow-primary/40 active:translate-y-0"
 onClick={useRecoveredDraft}
 >
 Восстановить изменения
 </button>
 </div>
 </div>
 </div>
 </div>
 )}

 {showSeedRegenerateModal && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
 <div className="w-full max-w-md rounded-2xl border border-stroke bg-surface-strong p-5 shadow-xl ">
 <h4 className="text-base font-semibold text-foreground ">Подтверждение</h4>
 <p className="mt-2 text-sm text-foreground/80 ">
 Вы уверены, что хотите перегенерировать сид?
 </p>
 <div className="mt-4 flex justify-end gap-2">
 <button
 type="button"
 className="rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground/80 hover:bg-surface "
 onClick={() => setShowSeedRegenerateModal(false)}
 >
 Отмена
 </button>
 <button
 type="button"
 className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-strong"
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

 {showDeleteConfirmModal && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
 <div className="w-full max-w-md rounded-2xl border border-stroke bg-surface-strong p-5 shadow-xl ">
 <h4 className="text-base font-semibold text-foreground ">Подтверждение удаления</h4>
 <p className="mt-2 text-sm text-foreground/80 ">
 Удалить упражнение {form.seedKey.trim() || `#${form.id}`}? Это действие также удалит связанные попытки и не может быть отменено.
 </p>
 <div className="mt-4 flex justify-end gap-2">
 <button
 type="button"
 className="rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground/80 hover:bg-surface "
 onClick={() => setShowDeleteConfirmModal(false)}
 disabled={deleting}
 >
 Отмена
 </button>
 <button
 type="button"
 className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-600 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
 onClick={() => void handleDeleteExercise()}
 disabled={deleting}
 >
 {deleting ? 'Удаление...' : 'Удалить'}
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
 <div className="mb-1 text-sm font-medium text-foreground/80 ">{label}</div>
 {children}
 </label>
 );
}



function normalizeSearchText(input: string) {
 return String(input ?? '')
 .toLowerCase()
 .replace(/\u00ad/g, '')
 .replace(/[*_`~[\]()<>{}|\\]/g, '')
 .replace(/\s+/g, ' ')
 .trim();
}

function parseEge21SentencesText(raw: string): Array<{ index: number; text: string }> {
 const text = raw.trim();
 if (!text) return [];

 // Supports both line-by-line format:
 // 1. ...
 // 2) ...
 // and inline format:
 // 1. ... 2) ... 3) ...
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

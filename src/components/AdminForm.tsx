'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import { commands, type ICommand } from '@uiw/react-md-editor';
import { useTheme } from '@/components/theme-provider';
import rehypeRaw from 'rehype-raw';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import {
 batchUpdateExercisesMetaAction,
 createExerciseAction,
 deleteExerciseAction,
 getExerciseByIdAction,
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
 selection: state.selection,
 prefix: style.prefix,
 suffix: style.suffix ?? style.prefix,
 });
 } else {
 executeHtmlToggle({
 api,
 selectedText: state1.selectedText,
 selection: state.selection,
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
 initialTotalItems?: number;
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
 case 'punctuation_insert':
 return 'punc';
 default:
 return 'mc';
 }
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
 // For existing exercises, prefer fresh server data to avoid stale local drafts
 // masking updates made from another machine/user.
 if (targetId != null) {
 return normalizeFormForEditor(baseForm);
 }
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

function formatUpdatedAt(value: string) {
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return 'дата неизвестна';
 return new Intl.DateTimeFormat('ru-RU', {
 day: '2-digit',
 month: '2-digit',
 year: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 }).format(date);
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
 initialItems.length > 0 ? initialItems[initialItems.length - 1].updatedAt : null,
);
const [totalItems, setTotalItems] = useState<number>(initialTotalItems ?? initialItems.length);
 const [loadingMore, setLoadingMore] = useState(false);
 const [selectedId, setSelectedId] = useState<number | null>(null);
 const [message, setMessage] = useState('');
 const [isError, setIsError] = useState(false);
 const [saving, setSaving] = useState(false);
 const [deleting, setDeleting] = useState(false);
 const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
 const [isSeedRegenerateArmed, setIsSeedRegenerateArmed] = useState(false);
 const [showSeedRegenerateModal, setShowSeedRegenerateModal] = useState(false);
 const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
 const [showFloatingSave, setShowFloatingSave] = useState(false);
 const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
 const [initialSelectionPending, setInitialSelectionPending] = useState(Boolean(initialSelectedId && !initialSelectedExercise));
 const [listQuery, setListQuery] = useState('');
 const [listTypeFilter, setListTypeFilter] = useState<string>('all');
 const [listStatusFilter, setListStatusFilter] = useState<string>('all');
 const [listExamTypeFilter, setListExamTypeFilter] = useState<string>('all');
 const [listSortBy, setListSortBy] = useState<'id' | 'updatedAt' | 'type' | 'status'>('id');
 const [listSortDir, setListSortDir] = useState<'asc' | 'desc'>('asc');
 const [multiSelectedIds, setMultiSelectedIds] = useState<number[]>([]);
 const [lastMultiSelectedId, setLastMultiSelectedId] = useState<number | null>(null);
 const [selectionMode, setSelectionMode] = useState(false);
 const [showMoreBatchActions, setShowMoreBatchActions] = useState(false);
 const [batchStatus, setBatchStatus] = useState<(typeof qualityStatuses)[number]>('review');
 const [batchIsActive, setBatchIsActive] = useState<'active' | 'inactive'>('active');
 const [batchSaving, setBatchSaving] = useState(false);
 const [previewCheckResult, setPreviewCheckResult] = useState<{
 isCorrect: boolean;
 text: string;
 correctAnswer?: string;
 detailedExplanation?: string;
 } | null>(null);
 const historyPastRef = useRef<Form[]>([]);
 const historyFutureRef = useRef<Form[]>([]);
 const suppressHistoryRef = useRef(false);
 const lastSnapshotRef = useRef('');
 const lastPersistedSnapshotRef = useRef('');
 const switchingExerciseRef = useRef(false);
 const autosaveInFlightRef = useRef(false);
const autosaveRetryTimerRef = useRef<number | null>(null);
const initializedFromUrlRef = useRef(Boolean(initialSelectedId));
const initialTargetIdRef = useRef<number | null>(initialSelectedId);
const skipInitialListRefreshRef = useRef(initialItems.length > 0);
const sidebarRef = useRef<HTMLElement | null>(null);
 const formRef = useRef<HTMLFormElement | null>(null);
 const mainSaveAnchorRef = useRef<HTMLDivElement | null>(null);
 const [activeMarks, setActiveMarks] = useState<ActiveMarks>(EMPTY_ACTIVE_MARKS);

 const markdownCommands = useMemo<ICommand[]>(() => ([
 makeToggleCommand('bold', 'bold', <span style={{ fontSize: 14, fontWeight: 800 }}>B</span>, 'Жирный', { kind: 'markdown', prefix: '**' }, activeMarks.bold),
 makeToggleCommand('italic', 'italic', <span style={{ fontSize: 14, fontStyle: 'italic' }}>I</span>, 'Курсив', { kind: 'markdown', prefix: '*' }, activeMarks.italic),
 makeToggleCommand('strikethrough', 'strikethrough', <span style={{ fontSize: 14, textDecoration: 'line-through' }}>S</span>, 'Зачёркнутый', { kind: 'markdown', prefix: '~~' }, activeMarks.strike),
 makeToggleCommand('underline', 'underline', <span style={{ fontSize: 14, textDecoration: 'underline' }}>U</span>, 'Подчёркнутый', { kind: 'html', openTag: '<u>', closeTag: '</u>' }, activeMarks.underline),
 makeToggleCommand('doubleUnderline', 'doubleUnderline', <span style={{ fontSize: 14, textDecoration: 'underline double' }}>U</span>, 'Двойное подчёркивание', { kind: 'html', openTag: '<ins class="du">', closeTag: '</ins>' }, activeMarks.doubleUnderline),
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
 ]), [activeMarks]);

 useEffect(() => {
 if (!initialSelectedId) {
 const params = new URLSearchParams(window.location.search);
 const rawId = params.get('id') ?? params.get('exerciseId');
 const fallbackId = localStorage.getItem('admin_last_selected_id');
 const id = Number(rawId ?? fallbackId ?? NaN);
 const hasTargetId = Number.isInteger(id) && id > 0;
 initialTargetIdRef.current = hasTargetId ? id : null;
 initializedFromUrlRef.current = hasTargetId;
 }

 if (!initializedFromUrlRef.current && !initialSelectedExercise) {
 setForm(loadFormState(null, EMPTY));
 setInitialSelectionPending(false);
 }
 }, [initialSelectedId, initialSelectedExercise]);

 useEffect(() => {
 if (!isDraftLoaded) return;
 if (lastPersistedSnapshotRef.current) return;
 lastPersistedSnapshotRef.current = JSON.stringify(form);
 }, [form, isDraftLoaded]);

 useEffect(() => {
 if (!isDraftLoaded) return;
 const timer = setTimeout(() => {
 localStorage.setItem(getDraftKey(form.id), JSON.stringify(form));
 }, 1000);
 return () => clearTimeout(timer);
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

 useEffect(() => {
 const url = new URL(window.location.href);
 if (form.id) {
 url.searchParams.set('id', String(form.id));
 url.searchParams.delete('slug');
 url.searchParams.delete('exerciseId');
 }
 const nextUrl = `${url.pathname}${url.search}${url.hash}`;
 const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
 if (nextUrl !== currentUrl) {
 window.history.replaceState(window.history.state, '', nextUrl);
 }
 }, [form.id, form.prompt]);

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

 function updateActiveMarksFromTarget(target: EventTarget | null) {
 if (!(target instanceof HTMLTextAreaElement)) return;
 const nextState: TextSelState = {
 text: target.value,
 selectedText: target.value.slice(target.selectionStart, target.selectionEnd),
 selection: { start: target.selectionStart, end: target.selectionEnd },
 };
 setActiveMarks(getActiveMarksFromState(nextState));
 }

 useEffect(() => {
 const onSelectionChange = () => {
 const active = document.activeElement;
 if (!(active instanceof HTMLTextAreaElement)) return;
 if (!active.className.includes('w-md-editor-text-input')) return;
 updateActiveMarksFromTarget(active);
 };
 document.addEventListener('selectionchange', onSelectionChange);
 return () => document.removeEventListener('selectionchange', onSelectionChange);
 }, []);

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
 const q = listQuery.trim().toLowerCase();
 const filtered = items.filter((item) => {
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
 return [...filtered].sort((a, b) => {
 let cmp = 0;
 if (listSortBy === 'id') cmp = a.id - b.id;
 else if (listSortBy === 'updatedAt') cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
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
 sortBy: listSortBy === 'updatedAt' ? 'updatedAt' : 'id',
 sortDir: listSortDir,
 includeTotal: true,
 query: listQuery,
 type: listTypeFilter,
 qualityStatus: listStatusFilter,
 examType: listExamTypeFilter,
 });
 if (res.success) {
 setItems(res.items as ListItem[]);
 setNextOffset(res.nextOffset ?? (res.items?.length ?? 0));
 setHasMore(Boolean(res.hasMore));
 const cursorId = typeof res.nextCursorId === 'number' ? res.nextCursorId : null;
 const cursorUpdatedAt = typeof res.nextCursorUpdatedAt === 'string' ? res.nextCursorUpdatedAt : null;
 setNextCursorId(cursorId);
 setNextCursorUpdatedAt(cursorUpdatedAt);
 setTotalItems(Number(res.total ?? res.items.length));
 } else {
 setIsError(true);
 setMessage(res.error || 'Ошибка загрузки списка заданий.');
 }
 }

 async function loadMore() {
 if (!hasMore || loadingMore) return;
 setLoadingMore(true);
 const res = await listExercisesAction({
 limit: 150,
 offset: nextOffset,
 cursorId: nextCursorId,
 cursorUpdatedAt: nextCursorUpdatedAt,
 sortBy: listSortBy === 'updatedAt' ? 'updatedAt' : 'id',
 sortDir: listSortDir,
 includeTotal: false,
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
 const cursorId = typeof res.nextCursorId === 'number' ? res.nextCursorId : null;
 const cursorUpdatedAt = typeof res.nextCursorUpdatedAt === 'string' ? res.nextCursorUpdatedAt : null;
 setNextCursorId(cursorId);
 setNextCursorUpdatedAt(cursorUpdatedAt);
 } else {
 setIsError(true);
 setMessage(res.error || 'Ошибка подгрузки списка.');
 }
 setLoadingMore(false);
 }

useEffect(() => {
 if (skipInitialListRefreshRef.current) {
 skipInitialListRefreshRef.current = false;
 return;
 }
 const timer = setTimeout(() => {
 void refreshList();
 }, 0);
 return () => clearTimeout(timer);
 // eslint-disable-next-line react-hooks/exhaustive-deps
}, [listQuery, listTypeFilter, listStatusFilter, listExamTypeFilter, listSortBy, listSortDir]);

 useEffect(() => {
 if (!isSeedRegenerateArmed) return;
 const timer = setTimeout(() => setIsSeedRegenerateArmed(false), 5000);
 return () => clearTimeout(timer);
 }, [isSeedRegenerateArmed]);

useEffect(() => {
 if (selectedId) {
 localStorage.setItem('admin_last_selected_id', String(selectedId));
 return;
 }
 localStorage.removeItem('admin_last_selected_id');
 }, [selectedId]);

 useEffect(() => {
 if (!isDraftLoaded) return;
 setHasUnsavedChanges(JSON.stringify(form) !== lastPersistedSnapshotRef.current);
 }, [form, isDraftLoaded]);

 async function loadExercise(id: number) {
 const res = await getExerciseByIdAction(id);
 if (!res.success || !res.item) {
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
 await refreshList();
 } else {
 setIsError(true);
 setMessage(res.error || 'Ошибка массового обновления.');
 }
 setBatchSaving(false);
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
 await refreshList();
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
 }, [isDraftLoaded, initialSelectionPending]);

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
 ? source.fillAccepted.split(',').map((v) => v.trim()).filter(Boolean)
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

 async function autosaveCurrentToDbIfNeeded(nextId: number) {
 if (!isEdit || !form.id || form.id === nextId || saving || deleting) return;
 const snapshot = JSON.stringify(form);
 if (snapshot === lastPersistedSnapshotRef.current) return;
 const payload = buildPayloadFromForm(form);
 const res = await updateExerciseAction({ ...payload, id: form.id });
 if (res.success) {
 lastPersistedSnapshotRef.current = snapshot;
 await refreshList();
 } else if (autosaveRetryTimerRef.current == null) {
 autosaveRetryTimerRef.current = window.setTimeout(() => {
 autosaveRetryTimerRef.current = null;
 if (switchingExerciseRef.current || autosaveInFlightRef.current) return;
 void autosaveCurrentToDbIfNeeded(nextId);
 }, 3000);
 }
 }

 async function openExerciseWithAutosave(id: number) {
 if (switchingExerciseRef.current) return;
 switchingExerciseRef.current = true;
 try {
 await autosaveCurrentToDbIfNeeded(id);
 await loadExercise(id);
 } finally {
 switchingExerciseRef.current = false;
 }
 }

 useEffect(() => {
 if (!isDraftLoaded || !isEdit || !form.id) return;
 if (saving || deleting || switchingExerciseRef.current) return;
 const snapshot = JSON.stringify(form);
 if (snapshot === lastPersistedSnapshotRef.current) return;

 const timer = window.setTimeout(async () => {
 if (autosaveInFlightRef.current) return;
 autosaveInFlightRef.current = true;
 try {
 const payload = buildPayloadFromForm(form);
 const res = await updateExerciseAction({ ...payload, id: form.id! });
 if (res.success) {
 lastPersistedSnapshotRef.current = snapshot;
 await refreshList();
 } else if (autosaveRetryTimerRef.current == null) {
 autosaveRetryTimerRef.current = window.setTimeout(() => {
 autosaveRetryTimerRef.current = null;
 if (switchingExerciseRef.current || autosaveInFlightRef.current) return;
 if (!form.id) return;
 const retrySnapshot = JSON.stringify(form);
 if (retrySnapshot === lastPersistedSnapshotRef.current) return;
 void (async () => {
 autosaveInFlightRef.current = true;
 try {
 const retryPayload = buildPayloadFromForm(form);
 const retryRes = await updateExerciseAction({ ...retryPayload, id: form.id });
 if (retryRes.success) {
 lastPersistedSnapshotRef.current = retrySnapshot;
 await refreshList();
 }
 } finally {
 autosaveInFlightRef.current = false;
 }
 })();
 }, 3000);
 }
 } finally {
 autosaveInFlightRef.current = false;
 }
 }, 2000);

 return () => window.clearTimeout(timer);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [form, isDraftLoaded, isEdit, saving, deleting]);

 async function onSubmit(event: React.FormEvent) {
 event.preventDefault();
 setSaving(true);
 setMessage('');
 setIsError(false);
 const payload = buildPayloadFromForm(form);

 const res = isEdit
 ? await updateExerciseAction({ ...payload, id: form.id! })
 : await createExerciseAction(payload);

 if (res.success) {
 setMessage(isEdit ? 'Изменения сохранены.' : 'Задание создано.');
 localStorage.removeItem(getDraftKey(form.id));
 const nextForm = isEdit ? form : loadFormState(null, EMPTY);
 setForm(nextForm);
 lastPersistedSnapshotRef.current = JSON.stringify(nextForm);
 await refreshList();
 } else {
 setIsError(true);
 setMessage(res.error || 'Ошибка сохранения.');
 }

 setSaving(false);
 }

 async function handleDeleteExercise() {
 if (!isEdit || deleting) return;
 setShowDeleteConfirmModal(false);
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
 setShowDeleteConfirmModal(false);
 await refreshList();
 } else {
 setIsError(true);
 setMessage(res.error || 'Ошибка удаления.');
 }

 setDeleting(false);
 }

 return (
 <div className="mx-auto grid w-full max-w-[1400px] gap-5 items-start xl:grid-cols-[300px_minmax(0,1fr)]">
 <aside ref={sidebarRef} className="flex flex-col rounded-2xl border border-stroke bg-surface-strong p-4 text-foreground shadow-sm max-h-[60vh] xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
 <div className="mb-3 flex items-center justify-between">
 <h3 className="text-sm font-semibold">Задания · {totalItems}</h3>
 <div className="flex items-center gap-1">
 <button
 className="rounded-md px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-stroke "
 onClick={() => void refreshList()}
 >
 Обновить
 </button>
 {!selectionMode ? (
 <button
 className="rounded-md px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-stroke "
 onClick={() => setSelectionMode(true)}
 >
 Выбрать
 </button>
 ) : (
 <button
 className="rounded-md px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-stroke "
 onClick={clearMultiSelection}
 >
 Отмена
 </button>
 )}
 </div>
 </div>
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
 <select
 className={inputClass}
 value={batchStatus}
 onChange={(e) => setBatchStatus(e.target.value as typeof batchStatus)}
 >
 {qualityStatuses.map((status) => (
 <option key={status} value={status}>{status}</option>
 ))}
 </select>
 <select
 className={inputClass}
 value={batchIsActive}
 onChange={(e) => setBatchIsActive(e.target.value as typeof batchIsActive)}
 >
 <option value="active">Активно</option>
 <option value="inactive">Неактивно</option>
 </select>
 </div>
 ) : null}
 </div>
 )}
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
 <div className="grid grid-cols-2 gap-2">
 <select
 className={inputClass}
 value={listSortBy}
 onChange={(e) => setListSortBy(e.target.value as typeof listSortBy)}
 >
 <option value="id">Сорт: номер</option>
 <option value="updatedAt">Сорт: дата изменения</option>
 <option value="type">Сорт: тип</option>
 <option value="status">Сорт: статус</option>
 </select>
 <select
 className={inputClass}
 value={listSortDir}
 onChange={(e) => setListSortDir(e.target.value as typeof listSortDir)}
 >
 <option value="asc">Порядок: ↑</option>
 <option value="desc">Порядок: ↓</option>
 </select>
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
 {groupedItems.length === 0 && (
 <div className="rounded-lg border border-dashed border-stroke px-3 py-4 text-sm text-foreground/60">
 Ничего не найдено по текущим фильтрам.
 </div>
 )}
 {hasMore && (
 <button
 type="button"
 onClick={() => void loadMore()}
 disabled={loadingMore}
 className="w-full rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-medium text-foreground/80 transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
 >
 {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
 </button>
 )}
 </div>
 </aside>

 <div className={`rounded-2xl border border-stroke bg-surface-strong p-5 shadow-sm ${initialSelectionPending ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-opacity`}>
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
 <form
 ref={formRef}
 onSubmit={onSubmit}
 onMouseUpCapture={(e) => updateActiveMarksFromTarget(e.target)}
 onKeyUpCapture={(e) => updateActiveMarksFromTarget(e.target)}
 >
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
 onChange={(val, event) => {
 setForm((f) => ({ ...f, prompt: val || '' }));
 updateActiveMarksFromTarget(event?.target ?? null);
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
 onChange={(val, event) => {
 setForm((f) => ({ ...f, explanation: val || '' }));
 updateActiveMarksFromTarget(event?.target ?? null);
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
 <ExerciseRenderer exercise={preview.exercise} onSubmit={handlePreviewSubmit} />
 {previewCheckResult && (
 <div
 className={`mt-3 rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap ${
 previewCheckResult.isCorrect
 ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-600/30 dark:bg-emerald-950/40 dark:text-emerald-200'
 : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-600/30 dark:bg-amber-950/40 dark:text-amber-200'
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
 <ReactMarkdown rehypePlugins={[rehypeRaw]}>
 {renderEditorMarkdown(escapeMarkdownParenListMarkers(previewFeedbackSections.explanation))}
 </ReactMarkdown>
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



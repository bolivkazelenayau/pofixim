'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
 fetchExerciseById,
 fetchExerciseList,
 getExerciseIdFromHash,
 getExerciseIdFromSearch,
} from '@/components/admin-form/api';
import AdminCoreFields from '@/components/admin-form/AdminCoreFields';
import AdminDraftRecoveryModal from '@/components/admin-form/AdminDraftRecoveryModal';
import AdminChoiceFields from '@/components/admin-form/AdminChoiceFields';
import AdminEditorHeader from '@/components/admin-form/AdminEditorHeader';
import AdminExerciseSidebar from '@/components/admin-form/AdminExerciseSidebar';
import AdminDictationFields from '@/components/admin-form/AdminDictationFields';
import AdminMetaFields from '@/components/admin-form/AdminMetaFields';
import AdminMessageToast from '@/components/admin-form/AdminMessageToast';
import AdminOrthographyRepairFields from '@/components/admin-form/AdminOrthographyRepairFields';
import AdminPreviewPanel from '@/components/admin-form/AdminPreviewPanel';
import AdminPunctuationConstructorFields from '@/components/admin-form/AdminPunctuationConstructorFields';
import { inputClass, qualityStatuses } from '@/components/admin-form/constants';
import type { DatabaseIndicator } from '@/components/admin-form/DatabaseSaveIndicator';
import DeleteExerciseConfirmModal from '@/components/admin-form/DeleteExerciseConfirmModal';
import { EMPTY } from '@/components/admin-form/defaults';
import {
 getDraftKey,
 getDraftSessionId,
 loadFormState,
 logDraftRecoveryDebug,
 readStoredDraft,
 writeStoredDraft,
} from '@/components/admin-form/draftStorage';
import {
 splitFeedbackSections,
} from '@/components/admin-form/feedback';
import {
 buildTypeChangeMessage,
 convertFormForTypeChange,
 seedPrefixForType,
} from '@/components/admin-form/formTypeConversion';
import { buildPayloadFromForm, formFromExerciseItem } from '@/components/admin-form/formMapping';
import { buildPreviewExercise } from '@/components/admin-form/previewModel';
import FloatingSaveButton from '@/components/admin-form/FloatingSaveButton';
import SeedRegenerateConfirmModal from '@/components/admin-form/SeedRegenerateConfirmModal';
import type {
 AdminFormProps,
 ExerciseListResponse,
 Form,
 ListItem,
 PreviewCheckResult,
 RawPreviewItem,
} from '@/components/admin-form/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildDictationFeedbackText } from '@/features/exercises/dictationFeedback';
import {
 batchUpdateExercisesMetaAction,
 createExerciseAction,
 deleteExerciseAction,
 previewRawNormalizationAction,
 updateExerciseAction,
} from '@/app/actions/admin';
import { checkExerciseAnswer } from '@/features/exercises/checkers';
import { formatAdminDateTime, formatAdminTime } from '@/lib/date-time';
import { type Exercise, type SubmittedAnswer } from '@/features/exercises/schemas';
import { EXERCISE_TYPES } from '@/features/exercises/types';

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

function formatUpdatedAt(value: string) {
 return formatAdminDateTime(value);
}

export default function AdminForm({
 initialItems,
 initialTotalItems,
 initialSelectedId = null,
 initialSelectedExercise = null,
}: AdminFormProps) {
 const router = useRouter();
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
const [previewCheckResult, setPreviewCheckResult] = useState<PreviewCheckResult | null>(null);
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
const lastAppliedRefreshKeyRef = useRef('');
const inFlightRefreshKeyRef = useRef<string | null>(null);
const refreshSeqRef = useRef(0);
const refreshAbortControllerRef = useRef<AbortController | null>(null);
const sessionDraftIdsRef = useRef<Set<number>>(new Set());
const loadExerciseSeqRef = useRef(0);

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
 writeStoredDraft(form.id ?? null, form);
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
 writeStoredDraft(source.id ?? null, source);
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
 setPreviewDictationText('');
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

 const preview = useMemo(
  () => buildPreviewExercise({ form, parsedSkillTags, parsedSteps }),
  [form, parsedSkillTags, parsedSteps],
 );
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

 function startNewDraft() {
 setForm(loadFormState(null, EMPTY));
 setSelectedId(null);
 setDatabaseSaveState('draft');
 setDatabaseSavedAt(null);
 clearExerciseUrlSelection();
 setMessage('');
 setIsSeedRegenerateArmed(false);
 setShowSeedRegenerateModal(false);
 }

 function handleTypeChange(nextType: Form['type']) {
 setForm((current) => {
 const nextForm = convertFormForTypeChange(current, nextType);
 const transferMessage = buildTypeChangeMessage(current, nextForm);
 if (transferMessage) {
 setIsError(false);
 setMessage(transferMessage);
 }
 return nextForm;
 });
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

 const databaseIndicator: DatabaseIndicator = databaseSaveState === 'saved'
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
 <AdminExerciseSidebar
  sidebarRef={sidebarRef}
  hasActiveListFilter={hasActiveListFilter}
  matchingItems={matchingItems}
  totalItems={totalItems}
  initialListPending={initialListPending}
  shownCount={flatFilteredItems.length}
  databaseIndicator={databaseIndicator}
  selectionMode={selectionMode}
  shownItemsCount={flatFilteredItems.length}
  selectedCount={multiSelectedIds.length}
  batchSaving={batchSaving}
  showMoreBatchActions={showMoreBatchActions}
  batchStatus={batchStatus}
  batchIsActive={batchIsActive}
  listQuery={listQuery}
  listTypeFilter={listTypeFilter}
  listExamTypeFilter={listExamTypeFilter}
  listStatusFilter={listStatusFilter}
  listSortBy={listSortBy}
  listSortDir={listSortDir}
  sortPrefsReady={sortPrefsReady}
  listTypes={listTypes}
  listExamTypes={listExamTypes}
  rawPreviewFilter={rawPreviewFilter}
  rawPreviewLimit={rawPreviewLimit}
  rawPreviewLoading={rawPreviewLoading}
  rawPreviewItems={rawPreviewItems}
  groupedItems={groupedItems}
  selectedId={selectedId}
  multiSelectedSet={multiSelectedSet}
  hasMore={hasMore}
  loadingMore={loadingMore}
  onRefreshList={() => void refreshList({ includeTotal: true, force: true })}
  onEnableSelectionMode={() => setSelectionMode(true)}
  onClearSelection={clearMultiSelection}
  onSelectAllShownItems={selectAllShownItems}
  onApplyBatchStatus={() => void applyBatchStatus()}
  onApplyBatchActivity={() => void applyBatchActivity()}
  onToggleBatchMore={() => setShowMoreBatchActions((value) => !value)}
  onBatchStatusChange={setBatchStatus}
  onBatchIsActiveChange={setBatchIsActive}
  onListQueryChange={setListQuery}
  onListTypeFilterChange={setListTypeFilter}
  onListExamTypeFilterChange={setListExamTypeFilter}
  onListStatusFilterChange={setListStatusFilter}
  onListSortByChange={setListSortBy}
  onListSortDirChange={setListSortDir}
  onRawPreviewFilterChange={setRawPreviewFilter}
  onRawPreviewLimitChange={setRawPreviewLimit}
  onRunRawPreviewAudit={() => void runRawPreviewAudit()}
  onToggleSelection={toggleMultiSelectionByClick}
  onOpenExercise={(id) => void openExerciseWithAutosave(id)}
  onLoadMore={() => void loadMore()}
  formatUpdatedAt={formatUpdatedAt}
 />

 <div className={`rounded-2xl border border-stroke bg-surface-strong p-5 shadow-sm ${initialSelectionPending && !initialSelectedExercise ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-opacity`}>
 <AdminEditorHeader
 isEdit={isEdit}
 hasUnsavedChanges={hasUnsavedChanges}
 onUndo={undoForm}
 onRedo={redoForm}
 onNewDraft={startNewDraft}
 />

 <AdminMessageToast message={message} isError={isError} />

 <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
 <form
 ref={formRef}
 onSubmit={onSubmit}
 >
 <AdminCoreFields
 form={form}
 typeOptions={typeOptions}
 setForm={setForm}
 onTypeChange={handleTypeChange}
 onGenerateSeedClick={handleGenerateSeedClick}
 onSeedManualChange={() => setIsSeedRegenerateArmed(false)}
 />

 <AdminChoiceFields form={form} setForm={setForm} />

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

 <AdminDictationFields form={form} setForm={setForm} />

 <AdminOrthographyRepairFields form={form} setForm={setForm} />

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

 <AdminPunctuationConstructorFields form={form} setForm={setForm} />

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

 <AdminMetaFields
 form={form}
 setForm={setForm}
 mainSaveAnchorRef={mainSaveAnchorRef}
 saving={saving}
 deleting={deleting}
 isEdit={isEdit}
 onDeleteClick={() => setShowDeleteConfirmModal(true)}
 />
 </form>

 <AdminPreviewPanel
 preview={preview}
 previewMode={previewMode}
 previewCheckResult={previewCheckResult}
 previewFeedbackSections={previewFeedbackSections}
 previewDictationText={previewDictationText}
 onPreviewModeChange={setPreviewMode}
 onPreviewSubmit={handlePreviewSubmit}
 onPreviewDictationSubmit={handlePreviewDictationSubmit}
 onPreviewDictationTextChange={(text) => {
 setPreviewDictationText(text);
 setPreviewCheckResult(null);
 }}
 />
 </div>
 </div>

 <FloatingSaveButton
 visible={showFloatingSave}
 saving={saving}
 deleting={deleting}
 isEdit={isEdit}
 onClick={() => formRef.current?.requestSubmit()}
 />

 {draftRecovery ? (
 <AdminDraftRecoveryModal
 exerciseId={draftRecovery.id}
 onUseDatabaseVersion={useDatabaseVersion}
 onUseRecoveredDraft={useRecoveredDraft}
 />
 ) : null}

 {showSeedRegenerateModal ? (
 <SeedRegenerateConfirmModal
 onCancel={() => setShowSeedRegenerateModal(false)}
 onConfirm={() => {
 generateSeedKey();
 setShowSeedRegenerateModal(false);
 }}
 />
 ) : null}

 {showDeleteConfirmModal ? (
 <DeleteExerciseConfirmModal
 exerciseLabel={form.seedKey.trim() || `#${form.id}`}
 deleting={deleting}
 onCancel={() => setShowDeleteConfirmModal(false)}
 onConfirm={() => void handleDeleteExercise()}
 />
 ) : null}
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


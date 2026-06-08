import type { ExerciseEditorInput } from '@/app/actions/admin';
import type { ExerciseCategory } from '@/features/exercises/types';
import type { qualityStatuses } from './constants';

export type PMark = ',' | ':' | ';' | '-' | '—';

export type PCMark =
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

export type FeedbackSections = {
  lead: string;
  correctAnswer: string;
  explanation: string;
};

export type ListItem = {
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

export type ExerciseListRequest = {
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

export type ExerciseListResponse = {
  success: boolean;
  error?: string;
  items: ListItem[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
  nextCursorId: number | null;
  nextCursorUpdatedAt: string | null;
};

export type ExerciseDetailResponse = {
  success: boolean;
  error?: string;
  item?: Record<string, unknown>;
};

export type RawPreviewItem = {
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

export type AdminFormProps = {
  initialItems: ListItem[];
  initialTotalItems?: number | null;
  initialSelectedId?: number | null;
  initialSelectedExercise?: Record<string, unknown> | null;
};

export type Form = {
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

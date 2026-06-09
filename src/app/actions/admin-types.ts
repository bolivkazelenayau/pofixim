import type {
  ExerciseCategory,
  ExerciseType,
  PunctuationConstructorMark,
} from '@/features/exercises/types';

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

export type { PunctuationConstructorMark };

export const EXERCISE_TYPES = [
  'multiple_choice',
  'ege_multi_select',
  'fill_blank',
  'word_bank_cloze',
  'punctuation_insert',
  'ege20_complex_sentence_punctuation',
  'ege21_punctuation_analysis',
  'highlight_error',
  'match_pairs',
  'order_fragments',
  'text_correction',
  'dictation',
  'word_search',
  'punctuation_constructor',
  'orthography_repair',
] as const;

export const EXERCISE_CATEGORIES = ['orthography', 'punctuation', 'mixed'] as const;

export const DIFFICULTY_LEVELS = [1, 2] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];
export type ExerciseDifficulty = (typeof DIFFICULTY_LEVELS)[number];

export type MultipleChoicePayload = {
  options: string[];
};

export type MultipleChoiceAnswer = {
  correctOptionIndex: number;
};

export type EgeMultiSelectPayload = {
  options: string[];
  feedback?: {
    correctAnswer: string[];
    explanation: string[];
  };
};

export type EgeMultiSelectAnswer = {
  rawAnswerText: string;
  acceptedAnswers: string[];
  targetSet: number[];
};

export type FillBlankPayload = {
  before: string;
  after: string;
  placeholderLabel?: string;
};

export type FillBlankAnswer = {
  accepted: string[];
  caseSensitive?: boolean;
};

export type WordBankClozePayload = {
  textWithSlots: string;
  slotCount: number;
  wordBank: string[];
};

export type WordBankClozeAnswer = {
  correctBySlot: string[];
  caseSensitive?: boolean;
};

export type WordSearchPayload = {
  grid: string[][];
  words: string[];
  allowDiagonal?: boolean;
  allowReverse?: boolean;
};

export type WordSearchAnswer = {
  words: string[];
  caseSensitive?: boolean;
};

export type DictationPayload = {
  title: string;
  audioSrc: string;
  waveform?: number[];
  playbackRates?: number[];
};

export type DictationAnswer = {
  text: string;
  caseSensitive?: boolean;
  ignorePunctuation?: boolean;
};

export type OrthographyRepairPayload = {
  text: string;
  mode: 'click_then_choose' | 'click_then_type';
  targets: Array<{
    id: string;
    surface: string;
    replacement: string;
    type: 'word' | 'span';
    options?: string[];
    occurrence?: number;
  }>;
  hints?: string[];
};

export type OrthographyRepairAnswer = {
  repairs: Array<{
    targetId: string;
    correct: string;
  }>;
  correctText?: string;
};

export type OrderFragmentsPayload = {
  fragments: Array<{
    id: string;
    text: string;
  }>;
};

export type OrderFragmentsAnswer = {
  correctOrder: string[];
};

export type PunctuationMark = ',' | ':' | ';' | '-' | '—';

export type PunctuationInsertPayload = {
  tokens: string[];
  allowedMarks: PunctuationMark[];
};

export type PunctuationInsertAnswer = {
  marks: Array<{
    afterTokenIndex: number;
    mark: PunctuationMark;
  }>;
};

export type PunctuationConstructorMark =
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

export type PunctuationConstructorPayload = {
  tokens: string[];
  markBank: PunctuationConstructorMark[];
};

export type PunctuationConstructorAnswer = {
  placements: Array<{
    slotIndex: number;
    mark: PunctuationConstructorMark;
  }>;
};

export type Ege21PunctuationAnalysisPayload = {
  targetPunctuation: 'comma' | 'dash' | 'colon' | 'semicolon';
  sentences: Array<{
    index: number;
    text: string;
  }>;
};

export type Ege21PunctuationAnalysisAnswer = {
  rawAnswerText: string;
  acceptedAnswers: string[];
  targetSet: number[];
};

export type Ege20ComplexSentencePunctuationPayload = {
  textWithSlots: string;
  slots: number[];
};

export type Ege20ComplexSentencePunctuationAnswer = {
  rawAnswerText: string;
  acceptedAnswers: string[];
  targetSet: number[];
};

export type CheckMistake = {
  kind: string;
  message: string;
  target?: string;
};

export type AlgorithmStep = {
  id: string;
  title: string;
  required?: boolean;
};

export type ExerciseQualityStatus = 'draft' | 'review' | 'approved' | 'archived';

export type CheckResult = {
  isCorrect: boolean;
  scoreDelta: number;
  normalizedAnswer: unknown;
  mistakes: CheckMistake[];
  mistakeCode: string | null;
  failedStepIds: string[];
  stepFeedback: Array<{
    stepId: string;
    ok: boolean;
    message: string;
  }>;
  nextRecommendation: {
    mode: 'retry' | 'transfer' | 'challenge';
    reason: string;
  };
  feedback: {
    short: string;
    explanation: string;
    correctAnswer?: string;
    detailedExplanation?: string;
    visual?: unknown;
  };
};

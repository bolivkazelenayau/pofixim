import type { PunctuationConstructorExercise } from '../schemas';

export type Placement = PunctuationConstructorExercise['answer']['placements'][number];
export type ConstructorMark = Placement['mark'];
export type SlotStatus =
  | 'idle'
  | 'selected'
  | 'filled'
  | 'correct'
  | 'missing'
  | 'extra'
  | 'wrong'
  | 'wrong_order';

export type SlotFeedback = {
  status: SlotStatus;
  expected: ConstructorMark[];
  actual: ConstructorMark[];
};

export const MARK_META = {
  comma: { glyph: ',', label: 'запятая' },
  colon: { glyph: ':', label: 'двоеточие' },
  semicolon: { glyph: ';', label: 'точка с запятой' },
  dash: { glyph: '—', label: 'тире' },
  quote_open: { glyph: '«', label: 'открывающая кавычка' },
  quote_close: { glyph: '»', label: 'закрывающая кавычка' },
  paren_open: { glyph: '(', label: 'открывающая скобка' },
  paren_close: { glyph: ')', label: 'закрывающая скобка' },
  period: { glyph: '.', label: 'точка' },
  exclamation: { glyph: '!', label: 'восклицательный знак' },
  question: { glyph: '?', label: 'вопросительный знак' },
  ellipsis: { glyph: '...', label: 'многоточие' },
} satisfies Record<ConstructorMark, { glyph: string; label: string }>;

const BASE_MARK_BANK: ConstructorMark[] = [
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
];

const MARK_GROUPS: Array<{
  id: string;
  label: string;
  marks: ConstructorMark[];
}> = [
  {
    id: 'breaks',
    label: 'паузы',
    marks: ['comma', 'semicolon', 'colon', 'dash'],
  },
  {
    id: 'finals',
    label: 'финал',
    marks: ['period', 'question', 'exclamation', 'ellipsis'],
  },
  {
    id: 'brackets',
    label: 'кавычки и скобки',
    marks: ['quote_open', 'quote_close', 'paren_open', 'paren_close'],
  },
];

export const STATUS_CLASS: Record<SlotStatus, string> = {
  idle: 'border-dashed border-stroke bg-surface-strong hover:border-amber-300 dark:bg-foreground/5 dark:hover:border-amber-300/60',
  selected: 'border-amber-500 bg-amber-50 ring-2 ring-amber-100 dark:border-amber-300 dark:bg-amber-300/12 dark:ring-amber-300/20',
  filled: 'border-amber-300 bg-amber-50 dark:border-amber-300/45 dark:bg-amber-300/12',
  correct: 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100 dark:border-emerald-300/60 dark:bg-emerald-300/12 dark:ring-emerald-300/20',
  missing: 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-100 dark:border-yellow-300/60 dark:bg-yellow-300/12 dark:ring-yellow-300/20',
  extra: 'border-rose-400 bg-rose-50 ring-2 ring-rose-100 dark:border-rose-300/60 dark:bg-rose-300/12 dark:ring-rose-300/20',
  wrong: 'border-orange-400 bg-orange-50 ring-2 ring-orange-100 dark:border-orange-300/60 dark:bg-orange-300/12 dark:ring-orange-300/20',
  wrong_order: 'border-fuchsia-400 bg-fuchsia-50 ring-2 ring-fuchsia-100 dark:border-fuchsia-300/60 dark:bg-fuchsia-300/12 dark:ring-fuchsia-300/20',
};

export function markGlyph(mark: ConstructorMark) {
  return MARK_META[mark].glyph;
}

export function normalizePlacements(placements: Placement[]) {
  return placements
    .map((placement, order) => ({ ...placement, order }))
    .sort((a, b) =>
      a.slotIndex === b.slotIndex ? a.order - b.order : a.slotIndex - b.slotIndex,
    )
    .map((placement) => ({
      slotIndex: placement.slotIndex,
      mark: placement.mark,
    }));
}

function marksForSlot(placements: Placement[], slotIndex: number) {
  return placements
    .filter((placement) => placement.slotIndex === slotIndex)
    .map((placement) => placement.mark);
}

function sameMarks(a: ConstructorMark[], b: ConstructorMark[]) {
  return a.length === b.length && a.every((mark, index) => mark === b[index]);
}

function sameMarkMultiset(a: ConstructorMark[], b: ConstructorMark[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((mark, index) => mark === sortedB[index]);
}

export function buildSlotFeedback(params: {
  expectedPlacements: Placement[];
  actualPlacements: Placement[];
  slotCount: number;
  checked: boolean;
  activeSlotIndex: number | null;
}) {
  const { expectedPlacements, actualPlacements, slotCount, checked, activeSlotIndex } =
    params;
  const feedback = new Map<number, SlotFeedback>();

  for (let slotIndex = 0; slotIndex <= slotCount; slotIndex += 1) {
    const expected = marksForSlot(expectedPlacements, slotIndex);
    const actual = marksForSlot(actualPlacements, slotIndex);
    let status: SlotStatus = 'idle';

    if (!checked) {
      status =
        activeSlotIndex === slotIndex
          ? 'selected'
          : actual.length > 0
            ? 'filled'
            : 'idle';
    } else if (sameMarks(expected, actual)) {
      status = expected.length || actual.length ? 'correct' : 'idle';
    } else if (expected.length > 0 && actual.length === 0) {
      status = 'missing';
    } else if (expected.length === 0 && actual.length > 0) {
      status = 'extra';
    } else if (sameMarkMultiset(expected, actual)) {
      status = 'wrong_order';
    } else {
      status = 'wrong';
    }

    feedback.set(slotIndex, { status, expected, actual });
  }

  return feedback;
}

export function renderConstructorSentence(tokens: string[], placements: Placement[]) {
  const normalized = normalizePlacements(placements);
  const parts: string[] = [];

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const beforeMarks = normalized
      .filter((placement) => placement.slotIndex === tokenIndex)
      .map((placement) => markGlyph(placement.mark))
      .join('');

    if (beforeMarks) parts.push(beforeMarks);
    parts.push(tokens[tokenIndex]);
  }

  const tailMarks = normalized
    .filter((placement) => placement.slotIndex === tokens.length)
    .map((placement) => markGlyph(placement.mark))
    .join('');

  if (tailMarks) parts.push(tailMarks);

  return parts
    .join(' ')
    .replace(/\s+([,;:.!?»])/g, '$1')
    .replace(/([:;])«/g, '$1 «')
    .trim();
}

export function glyphs(marks: ConstructorMark[]) {
  return marks.map((mark) => markGlyph(mark)).join('');
}

export function visibleMarkBank(markBank: ConstructorMark[]) {
  return [...new Set([...BASE_MARK_BANK, ...markBank])];
}

export function visibleMarkGroups(markBank: ConstructorMark[]) {
  const visible = new Set(visibleMarkBank(markBank));
  const grouped = new Set<ConstructorMark>();
  const groups = MARK_GROUPS.map((group) => {
    const marks = group.marks.filter((mark) => visible.has(mark));
    marks.forEach((mark) => grouped.add(mark));
    return { ...group, marks };
  }).filter((group) => group.marks.length > 0);

  const looseMarks = [...visible].filter((mark) => !grouped.has(mark));
  if (looseMarks.length > 0) {
    groups.push({ id: 'other', label: 'другое', marks: looseMarks });
  }

  return groups;
}

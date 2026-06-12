'use client';

import { useMemo, useState, useEffect } from 'react';
import { useChatStore } from '../../../store/chatStore';
import { motion, useReducedMotion } from 'motion/react';
import { PRESS_TAP, whenMotion } from '@/lib/motion';
import type {
  PunctuationConstructorExercise,
  SubmittedAnswer,
} from '../schemas';

type Props = {
  exercise: PunctuationConstructorExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
  previewMode?: boolean;
};

type Placement = PunctuationConstructorExercise['answer']['placements'][number];
type ConstructorMark = Placement['mark'];
type SlotStatus =
  | 'idle'
  | 'selected'
  | 'filled'
  | 'correct'
  | 'missing'
  | 'extra'
  | 'wrong'
  | 'wrong_order';

type SlotFeedback = {
  status: SlotStatus;
  expected: ConstructorMark[];
  actual: ConstructorMark[];
};

const MARK_META = {
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

const STATUS_CLASS: Record<SlotStatus, string> = {
  idle: 'border-dashed border-stroke bg-surface-strong hover:border-cyan-300 dark:bg-foreground/5 dark:hover:border-cyan-300/60',
  selected: 'border-cyan-500 bg-cyan-50 ring-2 ring-cyan-100 dark:border-cyan-300 dark:bg-cyan-300/12 dark:ring-cyan-300/20',
  filled: 'border-amber-300 bg-amber-50 dark:border-amber-300/45 dark:bg-amber-300/12',
  correct: 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100 dark:border-emerald-300/60 dark:bg-emerald-300/12 dark:ring-emerald-300/20',
  missing: 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-100 dark:border-yellow-300/60 dark:bg-yellow-300/12 dark:ring-yellow-300/20',
  extra: 'border-rose-400 bg-rose-50 ring-2 ring-rose-100 dark:border-rose-300/60 dark:bg-rose-300/12 dark:ring-rose-300/20',
  wrong: 'border-orange-400 bg-orange-50 ring-2 ring-orange-100 dark:border-orange-300/60 dark:bg-orange-300/12 dark:ring-orange-300/20',
  wrong_order: 'border-fuchsia-400 bg-fuchsia-50 ring-2 ring-fuchsia-100 dark:border-fuchsia-300/60 dark:bg-fuchsia-300/12 dark:ring-fuchsia-300/20',
};

function markGlyph(mark: ConstructorMark) {
  return MARK_META[mark].glyph;
}

function normalizePlacements(placements: Placement[]) {
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

function buildSlotFeedback(params: {
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

function renderSentence(tokens: string[], placements: Placement[]) {
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

function glyphs(marks: ConstructorMark[]) {
  return marks.map((mark) => markGlyph(mark)).join('');
}

function firstMeaningfulSlot(exercise: PunctuationConstructorExercise) {
  return exercise.answer.placements[0]?.slotIndex ?? null;
}

function visibleMarkBank(markBank: ConstructorMark[]) {
  return [...new Set([...BASE_MARK_BANK, ...markBank])];
}

function visibleMarkGroups(markBank: ConstructorMark[]) {
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

export default function PunctuationConstructorCard({
  exercise,
  disabled,
  onSubmit,
  previewMode,
}: Props) {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(
    () => firstMeaningfulSlot(exercise),
  );
  const [selectedMark, setSelectedMark] = useState<ConstructorMark | null>(null);
  const [checked, setChecked] = useState(false);
  const [hintIndex, setHintIndex] = useState(-1);
  const [showStructure, setShowStructure] = useState(false);
  const [guidedMode, setGuidedMode] = useState(false);
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);

  const spendScore = useChatStore((state) => state.spendScore);
  const [unlockedHintsCount, setUnlockedHintsCount] = useState(0);
  const [unlockedStructure, setUnlockedStructure] = useState(false);
  const [unlockedGuidedMode, setUnlockedGuidedMode] = useState(false);
  const [showBuyHint, setShowBuyHint] = useState(false);
  const [timerStarted, setTimerStarted] = useState(!previewMode);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (disabled || !timerStarted) return;
    const timer = setTimeout(() => {
      setShowBuyHint(true);
    }, 30000);
    return () => clearTimeout(timer);
  }, [disabled, timerStarted]);
  const normalizedPlacements = useMemo(
    () => normalizePlacements(placements),
    [placements],
  );
  const markGroups = useMemo(
    () => visibleMarkGroups(exercise.payload.markBank),
    [exercise.payload.markBank],
  );
  const slotFeedback = useMemo(
    () =>
      buildSlotFeedback({
        expectedPlacements: exercise.answer.placements,
        actualPlacements: normalizedPlacements,
        slotCount: exercise.payload.tokens.length,
        checked,
        activeSlotIndex,
      }),
    [
      activeSlotIndex,
      checked,
      exercise.answer.placements,
      exercise.payload.tokens.length,
      normalizedPlacements,
    ],
  );

  function addMark(slotIndex: number, mark: ConstructorMark) {
    if (disabled) return;
    setChecked(false);
    setPlacements((current) => [...current, { slotIndex, mark }]);
    setActiveSlotIndex(slotIndex);
    setSelectedMark(null);
  }

  function removeMark(slotIndex: number, placementIndex: number) {
    if (disabled) return;
    setChecked(false);
    setPlacements((current) => {
      let seenInSlot = -1;
      return current.filter((placement) => {
        if (placement.slotIndex !== slotIndex) return true;
        seenInSlot += 1;
        return seenInSlot !== placementIndex;
      });
    });
    setActiveSlotIndex(slotIndex);
  }

  function moveMark(slotIndex: number, fromIndex: number, direction: -1 | 1) {
    if (disabled) return;
    setChecked(false);
    setPlacements((current) => {
      const next = [...current];
      const slotIndexes = next
        .map((placement, index) => ({ placement, index }))
        .filter((item) => item.placement.slotIndex === slotIndex)
        .map((item) => item.index);
      const fromGlobal = slotIndexes[fromIndex];
      const toGlobal = slotIndexes[fromIndex + direction];
      if (fromGlobal == null || toGlobal == null) return current;
      [next[fromGlobal], next[toGlobal]] = [next[toGlobal], next[fromGlobal]];
      return next;
    });
    setActiveSlotIndex(slotIndex);
  }

  function handleSlotSelect(slotIndex: number) {
    if (disabled) return;
    if (selectedMark) {
      addMark(slotIndex, selectedMark);
      return;
    }
    setActiveSlotIndex(slotIndex);
  }

  function handleMarkClick(mark: ConstructorMark) {
    if (disabled) return;
    if (activeSlotIndex === null) {
      setSelectedMark(mark);
      return;
    }
    addMark(activeSlotIndex, mark);
  }

  function slotPlacements(slotIndex: number) {
    return normalizedPlacements.filter(
      (placement) => placement.slotIndex === slotIndex,
    );
  }

  function submit() {
    const answerPlacements = normalizePlacements(placements);
    const label = renderSentence(exercise.payload.tokens, answerPlacements);
    setChecked(true);
    onSubmit(
      { type: 'punctuation_constructor', placements: answerPlacements },
      label,
    );
  }

  const currentHint =
    hintIndex >= 0 ? exercise.payload.hints?.[hintIndex] : undefined;
  const hasStructure = Boolean(exercise.payload.segments?.length);
  const guidedSteps = exercise.payload.guidedSteps ?? [];
  const currentGuidedStep = guidedMode ? guidedSteps[guidedStepIndex] : undefined;

  return (
    <div
      className="mb-5 mt-2 rounded-xl border border-stroke bg-surface-strong p-4 shadow-sm"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setSelectedMark(null);
          setActiveSlotIndex(null);
        }
        if (
          (event.key === 'Backspace' || event.key === 'Delete') &&
          activeSlotIndex !== null
        ) {
          const slotItems = slotPlacements(activeSlotIndex);
          if (slotItems.length > 0) {
            event.preventDefault();
            removeMark(activeSlotIndex, slotItems.length - 1);
          }
        }
      }}
    >
      <div className="rounded-xl border border-stroke bg-surface px-3 py-3">
        <div className="flex flex-wrap items-center gap-y-1.5 text-[18px] font-semibold leading-8 text-foreground">
          <Slot
            disabled={disabled}
            feedback={slotFeedback.get(0)}
            guidedTarget={currentGuidedStep?.slotIndex === 0}
            placements={slotPlacements(0)}
            selectedMark={selectedMark}
            slotIndex={0}
            onAddMark={addMark}
            onMoveMark={moveMark}
            onRemoveMark={removeMark}
            onSelect={handleSlotSelect}
          />
          {exercise.payload.tokens.map((token, tokenIndex) => {
            const slotIndex = tokenIndex + 1;

            return (
              <span
                key={`${token}-${tokenIndex}`}
                className="inline-flex items-center"
              >
                <span
                  className={`mx-0.5 rounded-md bg-surface-strong px-2 py-0.5 ${
                    showStructure && hasStructure
                      ? 'ring-2 ring-cyan-100 dark:ring-cyan-300/15'
                      : ''
                  }`}
                >
                  {token}
                </span>
                <Slot
                  disabled={disabled}
                  feedback={slotFeedback.get(slotIndex)}
                  guidedTarget={currentGuidedStep?.slotIndex === slotIndex}
                  placements={slotPlacements(slotIndex)}
                  selectedMark={selectedMark}
                  slotIndex={slotIndex}
                  onAddMark={addMark}
                  onMoveMark={moveMark}
                  onRemoveMark={removeMark}
                  onSelect={handleSlotSelect}
                />
              </span>
            );
          })}
        </div>
      </div>

      {!disabled && (
        <div className="mt-4 flex flex-wrap items-stretch gap-2">
          {markGroups.map((group) => (
            <div
              key={group.id}
              className="flex items-center gap-1 rounded-xl border border-stroke bg-surface px-1.5 py-1.5"
              title={group.label}
              aria-label={group.label}
            >
              {group.marks.map((mark) => (
                <MarkButton
                  key={mark}
                  disabled={disabled}
                  isSelected={selectedMark === mark}
                  mark={mark}
                  onClick={handleMarkClick}
                />
              ))}
            </div>
          ))}
          {activeSlotIndex === null && selectedMark && (
            <span className="text-xs font-medium text-foreground/60">
              Выбран знак {markGlyph(selectedMark)}. Нажмите на слот.
            </span>
          )}
        </div>
      )}

      {(exercise.payload.hints?.length || hasStructure || guidedSteps.length) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Текстовые подсказки */}
          {exercise.payload.hints?.length ? (
            unlockedHintsCount === 0 ? (
              showBuyHint ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    spendScore(50);
                    setUnlockedHintsCount(1);
                    setHintIndex(0);
                  }}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 shadow-sm transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100 dark:hover:bg-amber-300/15"
                >
                  💡 Подсказка (-50 баллов)
                </button>
              ) : null
            ) : (
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setHintIndex((current) =>
                      current >= unlockedHintsCount - 1 ? -1 : current + 1,
                    )
                  }
                  className="rounded-lg border border-stroke bg-surface px-3 py-2 text-sm font-semibold text-foreground/80 transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 disabled:hover:bg-surface dark:hover:bg-stroke"
                >
                  Подсказка {hintIndex >= 0 ? `${hintIndex + 1}/${unlockedHintsCount}` : ''}
                </button>
                {unlockedHintsCount < exercise.payload.hints.length && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      spendScore(50);
                      setUnlockedHintsCount((c) => c + 1);
                      setHintIndex(unlockedHintsCount);
                    }}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 shadow-sm transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100 dark:hover:bg-amber-300/15"
                  >
                    + Ещё (-50)
                  </button>
                )}
              </div>
            )
          ) : null}

          {/* Структура */}
          {hasStructure ? (
            !unlockedStructure ? (
              showBuyHint ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    spendScore(50);
                    setUnlockedStructure(true);
                    setShowStructure(true);
                  }}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 shadow-sm transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100 dark:hover:bg-amber-300/15"
                >
                  💡 Показать структуру (-50 баллов)
                </button>
              ) : null
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setShowStructure((value) => !value)}
                className="rounded-lg border border-stroke bg-surface px-3 py-2 text-sm font-semibold text-foreground/80 transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 disabled:hover:bg-surface dark:hover:bg-stroke"
              >
                {showStructure ? 'Скрыть структуру' : 'Показать структуру'}
              </button>
            )
          ) : null}

          {/* Пошагово */}
          {guidedSteps.length ? (
            !unlockedGuidedMode ? (
              showBuyHint ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    spendScore(100);
                    setUnlockedGuidedMode(true);
                    setGuidedMode(true);
                    const step = guidedSteps[guidedStepIndex];
                    if (step) setActiveSlotIndex(step.slotIndex);
                  }}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 shadow-sm transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100 dark:hover:bg-amber-300/15"
                >
                  💡 Пошагово (-100 баллов)
                </button>
              ) : null
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setGuidedMode((value) => {
                    const next = !value;
                    if (next) {
                      const step = guidedSteps[guidedStepIndex];
                      if (step) setActiveSlotIndex(step.slotIndex);
                    }
                    return next;
                  });
                }}
                className="rounded-lg border border-stroke bg-surface px-3 py-2 text-sm font-semibold text-foreground/80 transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 disabled:hover:bg-surface dark:hover:bg-stroke"
              >
                {guidedMode ? 'Свободно' : 'Пошагово'}
              </button>
            )
          ) : null}
        </div>
      )}

      {currentHint && (
        <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-950 dark:border-cyan-300/20 dark:bg-cyan-300/10 dark:text-cyan-100">
          {currentHint}
        </div>
      )}

      {showStructure && exercise.payload.segments?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {exercise.payload.segments.map((segment) => (
            <span
              key={`${segment.kind}-${segment.tokenStart}-${segment.tokenEnd}`}
              className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-900 dark:border-cyan-300/20 dark:bg-cyan-300/10 dark:text-cyan-100"
            >
              {segment.label}
            </span>
          ))}
        </div>
      ) : null}

      {currentGuidedStep && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="mr-2 font-mono text-xs text-amber-700">
                {guidedStepIndex + 1}/{guidedSteps.length}
              </span>
              {currentGuidedStep.title}
              {currentGuidedStep.marks?.length ? (
                <span className="ml-2 font-bold">
                  {glyphs(currentGuidedStep.marks)}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                disabled={disabled || guidedStepIndex === 0}
                onClick={() => {
                  const nextIndex = Math.max(0, guidedStepIndex - 1);
                  setGuidedStepIndex(nextIndex);
                  const step = guidedSteps[nextIndex];
                  if (step) setActiveSlotIndex(step.slotIndex);
                }}
                className="rounded-md border border-amber-300 bg-white px-2 py-1 font-semibold disabled:opacity-40 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={disabled || guidedStepIndex === guidedSteps.length - 1}
                onClick={() => {
                  const nextIndex = Math.min(
                    guidedSteps.length - 1,
                    guidedStepIndex + 1,
                  );
                  setGuidedStepIndex(nextIndex);
                  const step = guidedSteps[nextIndex];
                  if (step) setActiveSlotIndex(step.slotIndex);
                }}
                className="rounded-md border border-amber-300 bg-white px-2 py-1 font-semibold disabled:opacity-40 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100"
              >
                Дальше
              </button>
            </div>
          </div>
        </div>
      )}



      {previewMode && (
        <div className="mt-3 flex justify-end gap-2">
          {!timerStarted && !showBuyHint && (
            <button
              type="button"
              onClick={() => setTimerStarted(true)}
              className="rounded-md border border-stroke bg-surface px-2 py-1 text-[10px] font-bold text-foreground/50 hover:bg-stroke hover:text-foreground"
            >
              dev: start 30s timer
            </button>
          )}
          {!showBuyHint && (
            <button
              type="button"
              onClick={() => setShowBuyHint(true)}
              className="rounded-md border border-stroke bg-surface px-2 py-1 text-[10px] font-bold text-foreground/50 hover:bg-stroke hover:text-foreground"
            >
              dev: skip 30s
            </button>
          )}
          {(unlockedHintsCount > 0 || unlockedStructure || unlockedGuidedMode || showBuyHint || timerStarted) && (
            <button
              type="button"
              onClick={() => {
                setUnlockedHintsCount(0);
                setUnlockedStructure(false);
                setUnlockedGuidedMode(false);
                setShowBuyHint(false);
                setTimerStarted(false);
              }}
              className="rounded-md border border-stroke bg-surface px-2 py-1 text-[10px] font-bold text-foreground/50 hover:bg-stroke hover:text-foreground"
            >
              dev: reset state
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={disabled || placements.length === 0}
          onClick={() => {
            setPlacements([]);
            setChecked(false);
          }}
          className="rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground/80 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 disabled:hover:bg-surface-strong dark:hover:bg-stroke dark:disabled:hover:bg-surface-strong"
        >
          Сбросить
        </button>
        <motion.button
          whileTap={whenMotion(!disabled && !shouldReduceMotion, PRESS_TAP)}
          disabled={disabled}
          onClick={submit}
          className="min-w-0 flex-1 rounded-xl bg-primary px-5 py-3 font-bold text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:bg-[var(--stroke)] dark:disabled:bg-[var(--stroke)]"
        >
          Проверить
        </motion.button>
      </div>
    </div>
  );
}

function MarkButton({
  disabled,
  isSelected,
  mark,
  onClick,
}: {
  disabled?: boolean;
  isSelected: boolean;
  mark: ConstructorMark;
  onClick: (mark: ConstructorMark) => void;
}) {
  return (
    <button
      type="button"
      draggable={!disabled}
      disabled={disabled}
      onClick={() => onClick(mark)}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', mark);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      title={MARK_META[mark].label}
      className={`inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-2.5 text-lg font-black text-foreground shadow-sm transition-[background-color,border-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${
        isSelected
          ? 'border-amber-400 bg-amber-100 text-amber-900 ring-2 ring-amber-200 dark:border-amber-300 dark:bg-amber-300/18 dark:text-amber-100 dark:ring-amber-300/20'
          : 'border-cyan-300 bg-white hover:border-cyan-500 hover:bg-cyan-50 dark:border-cyan-300/25 dark:bg-foreground/5 dark:text-cyan-50 dark:hover:border-cyan-300/70 dark:hover:bg-cyan-300/10'
      }`}
    >
      {markGlyph(mark)}
    </button>
  );
}

function Slot({
  disabled,
  feedback,
  guidedTarget,
  placements,
  selectedMark,
  slotIndex,
  onAddMark,
  onMoveMark,
  onRemoveMark,
  onSelect,
}: {
  disabled?: boolean;
  feedback?: SlotFeedback;
  guidedTarget?: boolean;
  placements: Placement[];
  selectedMark: ConstructorMark | null;
  slotIndex: number;
  onAddMark: (slotIndex: number, mark: ConstructorMark) => void;
  onMoveMark: (slotIndex: number, fromIndex: number, direction: -1 | 1) => void;
  onRemoveMark: (slotIndex: number, placementIndex: number) => void;
  onSelect: (slotIndex: number) => void;
}) {
  const status = feedback?.status ?? 'idle';
  const placeholder = feedback?.expected.length
    ? glyphs(feedback.expected).replace(/./gu, '·')
    : '·';
  const compact = placements.length === 0 && !selectedMark;
  const sizeClass = compact
    ? 'h-10 min-w-10 px-1.5'
    : 'min-h-11 min-w-11 px-1.5';
  const slotLabel = selectedMark
    ? `Add ${MARK_META[selectedMark].label} to slot ${slotIndex}`
    : `Select punctuation slot ${slotIndex}`;

  if (disabled && status === 'idle') return null;

  return (
    <div
      role={placements.length === 0 ? 'button' : undefined}
      tabIndex={placements.length === 0 ? (disabled ? -1 : 0) : undefined}
      aria-disabled={placements.length === 0 ? disabled : undefined}
      aria-label={slotLabel}
      onClick={() => {
        if (!disabled) onSelect(slotIndex);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(slotIndex);
        }
        if (
          (event.key === 'Backspace' || event.key === 'Delete') &&
          placements.length > 0
        ) {
          event.preventDefault();
          onRemoveMark(slotIndex, placements.length - 1);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        event.preventDefault();
        const mark = event.dataTransfer.getData('text/plain') as ConstructorMark;
        if (mark && mark in MARK_META) {
          onAddMark(slotIndex, mark);
        }
      }}
      className={`inline-flex ${sizeClass} items-center justify-center rounded-lg border align-middle transition-[background-color,border-color,box-shadow,color,outline-color] duration-150 ease-out ${STATUS_CLASS[status]} ${
        selectedMark ? 'cursor-copy' : ''
      } ${guidedTarget ? 'outline outline-2 outline-offset-2 outline-amber-300' : ''} ${
        disabled ? 'opacity-60' : ''
      }`}
      title={`slot ${slotIndex}`}
    >
      {placements.length > 0 ? (
        <span className="flex items-center gap-0.5">
          {placements.map((placement, index) => (
            <span
              key={`${placement.mark}-${slotIndex}-${index}`}
              className="group inline-flex h-7 min-w-6 items-center justify-center rounded-md bg-amber-100 px-1 text-base font-black text-amber-900 shadow-inner dark:bg-amber-300/18 dark:text-amber-100 dark:shadow-none"
              title={MARK_META[placement.mark].label}
            >
              <button
                type="button"
                disabled={disabled}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={`${MARK_META[placement.mark].label} in slot ${slotIndex}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(slotIndex);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  if (!disabled) onRemoveMark(slotIndex, index);
                }}
                onKeyDown={(event) => {
                  if (disabled) return;
                  if (event.key === 'Backspace' || event.key === 'Delete') {
                    event.preventDefault();
                    event.stopPropagation();
                    onRemoveMark(slotIndex, index);
                  }
                }}
                title={`${MARK_META[placement.mark].label}. Delete — удалить`}
              >
                {markGlyph(placement.mark)}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveMark(slotIndex, index);
                }}
                className="ml-0.5 inline-flex size-8 items-center justify-center rounded-full text-[12px] leading-none text-amber-900/55 transition-colors duration-150 ease-out hover:bg-amber-200 hover:text-amber-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-30 dark:text-amber-100/55 dark:hover:bg-amber-300/20 dark:hover:text-amber-50"
                aria-label={`Удалить знак ${MARK_META[placement.mark].label}`}
                title="Удалить знак"
              >
                ×
              </button>
              {placements.length > 1 && (
                <span className="ml-1 inline-flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMoveMark(slotIndex, index, -1);
                    }}
                    className="inline-flex size-8 items-center justify-center rounded text-[10px] transition-colors duration-150 ease-out hover:bg-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-30 dark:hover:bg-amber-300/20"
                    aria-label={`Move ${MARK_META[placement.mark].label} left`}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === placements.length - 1}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMoveMark(slotIndex, index, 1);
                    }}
                    className="inline-flex size-8 items-center justify-center rounded text-[10px] transition-colors duration-150 ease-out hover:bg-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-30 dark:hover:bg-amber-300/20"
                    aria-label={`Move ${MARK_META[placement.mark].label} right`}
                  >
                    ›
                  </button>
                </span>
              )}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-sm font-black text-foreground/35">{placeholder}</span>
      )}
    </div>
  );
}

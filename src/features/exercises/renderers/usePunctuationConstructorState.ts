'use client';

import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';
import { useChatStore } from '@/store/chatStore';
import type {
  PunctuationConstructorExercise,
  SubmittedAnswer,
} from '../schemas';
import {
  buildSlotFeedback,
  normalizePlacements,
  renderConstructorSentence,
  visibleMarkGroups,
  type ConstructorMark,
  type Placement,
} from './punctuationConstructorModel';

type UsePunctuationConstructorStateOptions = {
  exercise: PunctuationConstructorExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
  previewMode?: boolean;
};

export function usePunctuationConstructorState({
  exercise,
  disabled,
  onSubmit,
  previewMode,
}: UsePunctuationConstructorStateOptions) {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [selectedMark, setSelectedMark] = useState<ConstructorMark | null>(
    null,
  );
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
    const label = renderConstructorSentence(
      exercise.payload.tokens,
      answerPlacements,
    );
    setChecked(true);
    onSubmit(
      { type: 'punctuation_constructor', placements: answerPlacements },
      label,
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
  }

  function resetPlacements() {
    setPlacements([]);
    setChecked(false);
  }

  function resetPreviewState() {
    setUnlockedHintsCount(0);
    setUnlockedStructure(false);
    setUnlockedGuidedMode(false);
    setShowBuyHint(false);
    setTimerStarted(false);
  }

  const currentHint =
    hintIndex >= 0 ? exercise.payload.hints?.[hintIndex] : undefined;
  const hasStructure = Boolean(exercise.payload.segments?.length);
  const guidedSteps = exercise.payload.guidedSteps ?? [];
  const currentGuidedStep = guidedMode
    ? guidedSteps[guidedStepIndex]
    : undefined;

  return {
    activeSlotIndex,
    addMark,
    currentGuidedStep,
    currentHint,
    guidedMode,
    guidedStepIndex,
    guidedSteps,
    handleKeyDown,
    handleMarkClick,
    handleSlotSelect,
    hasStructure,
    hintIndex,
    markGroups,
    moveMark,
    placements,
    removeMark,
    resetPlacements,
    resetPreviewState,
    selectedMark,
    setActiveSlotIndex,
    setGuidedMode,
    setGuidedStepIndex,
    setHintIndex,
    setShowBuyHint,
    setShowStructure,
    setTimerStarted,
    setUnlockedGuidedMode,
    setUnlockedHintsCount,
    setUnlockedStructure,
    showBuyHint,
    showStructure,
    slotFeedback,
    slotPlacements,
    spendScore,
    submit,
    timerStarted,
    unlockedGuidedMode,
    unlockedHintsCount,
    unlockedStructure,
  };
}

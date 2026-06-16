'use client';

import { motion, useReducedMotion } from 'motion/react';
import { PRESS_TAP, whenMotion } from '@/lib/motion';
import type {
  PunctuationConstructorExercise,
  SubmittedAnswer,
} from '../schemas';
import { MarkButton, Slot } from './PunctuationConstructorControls';
import {
  glyphs,
  markGlyph,
} from './punctuationConstructorModel';
import { usePunctuationConstructorState } from './usePunctuationConstructorState';

type Props = {
  exercise: PunctuationConstructorExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
  previewMode?: boolean;
};

export default function PunctuationConstructorCard({
  exercise,
  disabled,
  onSubmit,
  previewMode,
}: Props) {
  const shouldReduceMotion = useReducedMotion();
  const {
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
  } = usePunctuationConstructorState({
    disabled,
    exercise,
    onSubmit,
    previewMode,
  });

  return (
    <div
      className="mb-5 mt-2 rounded-[28px] border border-stroke bg-surface-strong p-4 shadow-sm"
      onKeyDown={handleKeyDown}
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
                  className={`mx-0.5 inline-flex min-h-10 items-center rounded-md bg-surface-strong px-2 ${
                    showStructure && hasStructure
                      ? 'ring-2 ring-amber-100 dark:ring-amber-300/15'
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
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-950 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
          {currentHint}
        </div>
      )}

      {showStructure && exercise.payload.segments?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {exercise.payload.segments.map((segment) => (
            <span
              key={`${segment.kind}-${segment.tokenStart}-${segment.tokenEnd}`}
              className="rounded-full border border-amber-200 bg-amber-50/70 px-3 py-1 text-xs font-semibold text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100"
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
              onClick={resetPreviewState}
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
          onClick={resetPlacements}
          className="rounded-lg rounded-bl-2xl border border-stroke bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground/80 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 disabled:hover:bg-surface-strong dark:hover:bg-stroke dark:disabled:hover:bg-surface-strong"
        >
          Сбросить
        </button>
        <motion.button
          whileTap={whenMotion(!disabled && !shouldReduceMotion, PRESS_TAP)}
          disabled={disabled}
          onClick={submit}
          className="min-w-0 flex-1 rounded-xl rounded-br-2xl bg-primary px-5 py-3 font-bold text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:bg-[var(--stroke)] dark:disabled:bg-[var(--stroke)]"
        >
          Проверить
        </motion.button>
      </div>
    </div>
  );
}
